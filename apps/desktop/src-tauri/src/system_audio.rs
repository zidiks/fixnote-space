//! What the computer plays (the other people on a call), for call notes. Windows only for now:
//! WASAPI loopback through cpal, from the default output device, following it when it changes
//! (headphones plugged in mid-call). The webview gets 16 kHz mono PCM and transcribes it on the
//! device like dictation; nothing is written to disk and nothing leaves the computer.

// Elsewhere only the tests use the shared parts below.
#![cfg_attr(not(windows), allow(dead_code))]

use serde::Serialize;
use tauri::ipc::Channel;

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SystemAudioEvent {
    /// Base64 of 16-bit little-endian mono PCM at 16 kHz.
    Chunk { data: String },
    /// Recording stopped on its own (no output device any more).
    Error { message: String },
}

/// Starts recording (stopping one that runs); fails when it cannot start at all.
#[tauri::command]
pub fn system_audio_start(events: Channel<SystemAudioEvent>) -> Result<(), String> {
    imp::start(move |event| {
        let _ = events.send(event);
    })
}

#[tauri::command]
pub fn system_audio_stop() {
    imp::stop();
}

/// Averages samples down to a lower rate (enough for speech), like `downsample` in the web app.
struct Downsampler {
    from: u32,
    to: u32,
    phase: u32,
    sum: f32,
    count: u32,
}

impl Downsampler {
    fn new(from: u32, to: u32) -> Self {
        Self {
            from: from.max(to),
            to,
            phase: 0,
            sum: 0.0,
            count: 0,
        }
    }

    fn push(&mut self, sample: f32, out: &mut Vec<f32>) {
        self.sum += sample;
        self.count += 1;
        self.phase += self.to;
        if self.phase >= self.from {
            self.phase -= self.from;
            out.push(self.sum / self.count as f32);
            self.sum = 0.0;
            self.count = 0;
        }
    }
}

/// 16-bit little-endian PCM, base64.
fn encode(samples: &[f32]) -> String {
    use base64::Engine;
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for s in samples {
        let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Where the audio stands in time. Loopback delivers nothing while the computer is silent, so
/// pauses are put back (up to `MAX_PAUSE`): the transcription hears where speech stopped.
struct Timeline {
    /// Samples accounted for: sent, padded or skipped.
    position: usize,
    /// Silence added during the current pause.
    padded: usize,
}

const RATE: u32 = 16_000;
/// A pause shorter than this is not a pause (the audio just arrived late).
const MIN_PAUSE: usize = RATE as usize / 2;
/// Longer pauses are cut to this: enough to end a phrase, no minutes of silence.
const MAX_PAUSE: usize = RATE as usize;

impl Timeline {
    /// Silence to add before audio that should start at `due`.
    fn pause_before(&mut self, due: usize) -> usize {
        let gap = due.saturating_sub(self.position);
        if gap < MIN_PAUSE {
            return 0;
        }
        let pad = gap.min(MAX_PAUSE.saturating_sub(self.padded));
        self.padded += pad;
        // The rest of a long pause is skipped.
        self.position = due;
        pad
    }

    fn audio(&mut self, samples: usize) {
        self.position += samples;
        self.padded = 0;
    }
}

#[cfg(windows)]
mod imp {
    use super::{encode, Downsampler, SystemAudioEvent, Timeline, RATE};
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{FromSample, SampleFormat, SizedSample};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::{Duration, Instant};

    /// About 100 ms of audio per message to the webview.
    const BATCH: usize = RATE as usize / 10;

    enum Msg {
        Audio(Vec<f32>),
        Failed(String),
    }

    fn running() -> &'static Mutex<Option<Arc<AtomicBool>>> {
        static RUNNING: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();
        RUNNING.get_or_init(|| Mutex::new(None))
    }

    pub fn start(send: impl Fn(SystemAudioEvent) + Send + 'static) -> Result<(), String> {
        stop();
        let stopped = Arc::new(AtomicBool::new(false));
        *running().lock().map_err(|_| "lock")? = Some(stopped.clone());
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        std::thread::Builder::new()
            .name("system-audio".into())
            .spawn(move || run(send, stopped, ready_tx))
            .map_err(|e| e.to_string())?;
        ready_rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "system audio did not start".to_string())?
    }

    pub fn stop() {
        if let Ok(mut current) = running().lock() {
            if let Some(stopped) = current.take() {
                stopped.store(true, Ordering::Relaxed);
            }
        }
    }

    struct Open {
        _stream: cpal::Stream,
        device: Option<cpal::DeviceId>,
    }

    fn default_id() -> Option<cpal::DeviceId> {
        cpal::default_host()
            .default_output_device()
            .and_then(|d| d.id().ok())
    }

    /// Records the default output device (an input stream on an output device is loopback).
    fn open(tx: SyncSender<Msg>) -> Result<Open, String> {
        let device = cpal::default_host()
            .default_output_device()
            .ok_or("no output device")?;
        let config = device.default_output_config().map_err(|e| e.to_string())?;
        let channels = usize::from(config.channels()).max(1);
        let rate = config.sample_rate();
        let stream_config = config.config();
        let stream = match config.sample_format() {
            SampleFormat::F32 => build::<f32>(&device, stream_config, channels, rate, tx),
            SampleFormat::I16 => build::<i16>(&device, stream_config, channels, rate, tx),
            SampleFormat::I32 => build::<i32>(&device, stream_config, channels, rate, tx),
            SampleFormat::U16 => build::<u16>(&device, stream_config, channels, rate, tx),
            other => return Err(format!("unsupported sample format {other}")),
        }?;
        stream.play().map_err(|e| e.to_string())?;
        Ok(Open {
            _stream: stream,
            device: device.id().ok(),
        })
    }

    fn build<T>(
        device: &cpal::Device,
        config: cpal::StreamConfig,
        channels: usize,
        rate: u32,
        tx: SyncSender<Msg>,
    ) -> Result<cpal::Stream, String>
    where
        T: SizedSample + Send + 'static,
        f32: FromSample<T>,
    {
        let mut down = Downsampler::new(rate, RATE);
        let failed = tx.clone();
        device
            .build_input_stream::<T, _, _>(
                config,
                move |data: &[T], _| {
                    let mut out = Vec::with_capacity(data.len() / channels / 2 + 1);
                    for frame in data.chunks(channels) {
                        let sum: f32 = frame.iter().map(|&s| s.to_sample::<f32>()).sum();
                        down.push(sum / frame.len() as f32, &mut out);
                    }
                    if !out.is_empty() {
                        // Full queue: the webview is far behind; dropping beats blocking audio.
                        let _ = tx.try_send(Msg::Audio(out));
                    }
                },
                move |err| {
                    let _ = failed.try_send(Msg::Failed(err.to_string()));
                },
                None,
            )
            .map_err(|e| e.to_string())
    }

    fn run(
        send: impl Fn(SystemAudioEvent),
        stopped: Arc<AtomicBool>,
        ready: mpsc::Sender<Result<(), String>>,
    ) {
        let (tx, rx) = mpsc::sync_channel::<Msg>(512);
        let mut current = match open(tx.clone()) {
            Ok(open) => {
                let _ = ready.send(Ok(()));
                open
            }
            Err(e) => {
                let _ = ready.send(Err(e));
                return;
            }
        };
        let started = Instant::now();
        let due = || (started.elapsed().as_secs_f64() * f64::from(RATE)) as usize;
        let mut timeline = Timeline {
            position: 0,
            padded: 0,
        };
        let mut batch: Vec<f32> = Vec::with_capacity(BATCH * 2);
        let mut checked = Instant::now();
        let flush = |batch: &mut Vec<f32>| {
            if !batch.is_empty() {
                send(SystemAudioEvent::Chunk {
                    data: encode(batch),
                });
                batch.clear();
            }
        };

        while !stopped.load(Ordering::Relaxed) {
            let mut failure = None;
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Msg::Audio(samples)) => {
                    let pad = timeline.pause_before(due().saturating_sub(samples.len()));
                    batch.extend(std::iter::repeat_n(0.0, pad));
                    timeline.audio(samples.len());
                    batch.extend(samples);
                    if batch.len() >= BATCH {
                        flush(&mut batch);
                    }
                }
                Ok(Msg::Failed(message)) => failure = Some(message),
                Err(RecvTimeoutError::Timeout) => {
                    // Nothing plays: let the pause be heard now, not when sound comes back.
                    let pad = timeline.pause_before(due());
                    batch.extend(std::iter::repeat_n(0.0, pad));
                    flush(&mut batch);
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
            // Sound moved to another device (headphones): follow the default output.
            if failure.is_none() && checked.elapsed() > Duration::from_secs(2) {
                checked = Instant::now();
                if default_id() != current.device {
                    failure = Some("output device changed".into());
                }
            }
            if let Some(message) = failure {
                flush(&mut batch);
                drop(current);
                match reopen(&tx, &stopped) {
                    Some(open) => current = open,
                    None => {
                        send(SystemAudioEvent::Error { message });
                        return;
                    }
                }
            }
        }
        flush(&mut batch);
    }

    /// A few tries over a few seconds: a device that was just switched may not be ready yet.
    fn reopen(tx: &SyncSender<Msg>, stopped: &AtomicBool) -> Option<Open> {
        for _ in 0..10 {
            if stopped.load(Ordering::Relaxed) {
                return None;
            }
            if let Ok(open) = open(tx.clone()) {
                return Some(open);
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        None
    }
}

#[cfg(not(windows))]
mod imp {
    use super::SystemAudioEvent;

    pub fn start(_send: impl Fn(SystemAudioEvent) + Send + 'static) -> Result<(), String> {
        Err("unsupported".into())
    }

    pub fn stop() {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downsamples_48k_to_16k() {
        let mut d = Downsampler::new(48_000, 16_000);
        let mut out = Vec::new();
        for i in 0..48_000 {
            d.push(if i % 3 == 0 { 0.2 } else { 0.65 }, &mut out);
        }
        assert_eq!(out.len(), 16_000);
        // Each output averages three inputs.
        assert!(out.iter().all(|v| (v - 0.5).abs() < 1e-6));
    }

    #[test]
    fn downsamples_44_1k() {
        let mut d = Downsampler::new(44_100, 16_000);
        let mut out = Vec::new();
        for _ in 0..44_100 {
            d.push(0.25, &mut out);
        }
        assert!((15_999..=16_000).contains(&out.len()));
    }

    #[test]
    fn puts_pauses_back_up_to_a_second() {
        let mut t = Timeline {
            position: 0,
            padded: 0,
        };
        t.audio(RATE as usize);
        // Audio arrives on time: no pause.
        assert_eq!(t.pause_before(RATE as usize + 100), 0);
        // Five seconds of silence: one second of it comes back, the rest is skipped.
        assert_eq!(t.pause_before(RATE as usize * 6), MAX_PAUSE);
        assert_eq!(t.position, RATE as usize * 6);
        // The same pause goes on: nothing more is added.
        assert_eq!(t.pause_before(RATE as usize * 7), 0);
        t.audio(1600);
        // A new pause after new audio can be padded again.
        assert_eq!(t.pause_before(RATE as usize * 9), MAX_PAUSE);
    }

    #[test]
    fn encodes_16_bit_pcm() {
        use base64::Engine;
        let data = encode(&[0.0, 1.0, -1.0, 2.0]);
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data)
            .unwrap();
        assert_eq!(bytes, [0, 0, 0xff, 0x7f, 0x01, 0x80, 0xff, 0x7f]);
    }
}

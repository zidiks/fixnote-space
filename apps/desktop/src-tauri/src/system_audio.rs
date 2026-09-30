//! What the computer plays (the other people on a call), for call notes. Windows: WASAPI loopback
//! through cpal, from the default output device, following it when it changes (headphones plugged
//! in mid-call). macOS 14.2+: a Core Audio tap of everything the Mac plays. The webview gets
//! 16 kHz mono PCM and transcribes it on the device like dictation; nothing is written to disk and
//! nothing leaves the computer.

// Elsewhere (Linux) only the tests use the shared parts below.
#![cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SystemAudioEvent {
    /// Base64 of 16-bit little-endian mono PCM at 16 kHz.
    Chunk { data: String },
    /// Recording stopped on its own (no output device any more).
    Error { message: String },
}

/// Whether this computer can record what it plays (Windows; macOS 14.2 and later).
#[tauri::command]
pub fn system_audio_supported() -> bool {
    imp::supported()
}

/// Starts recording (stopping one that runs); fails when it cannot start at all.
#[tauri::command]
pub fn system_audio_start(events: Channel<SystemAudioEvent>) -> Result<(), String> {
    start(move |event| {
        let _ = events.send(event);
    })
}

#[tauri::command]
pub fn system_audio_stop() {
    stop();
}

/// A call is being recorded: quitting the app would lose it.
pub fn recording() -> bool {
    running().lock().map(|r| r.is_some()).unwrap_or(false)
}

/// From the audio thread to the recording thread.
enum Msg {
    Audio(Vec<f32>),
    Failed(String),
}

type Ready = mpsc::Sender<Result<(), String>>;

fn running() -> &'static Mutex<Option<Arc<AtomicBool>>> {
    static RUNNING: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(None))
}

fn start(send: impl Fn(SystemAudioEvent) + Send + 'static) -> Result<(), String> {
    if !imp::supported() {
        return Err("unsupported".into());
    }
    stop();
    let stopped = Arc::new(AtomicBool::new(false));
    *running().lock().map_err(|_| "lock")? = Some(stopped.clone());
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let thread = stopped.clone();
    std::thread::Builder::new()
        .name("system-audio".into())
        .spawn(move || imp::run(send, thread, ready_tx))
        .map_err(|e| e.to_string())?;
    let started = ready_rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "system audio did not start".to_string())
        .and_then(|r| r);
    if started.is_err() {
        stopped.store(true, Ordering::Relaxed);
        if let Ok(mut current) = running().lock() {
            if current.as_ref().is_some_and(|c| Arc::ptr_eq(c, &stopped)) {
                *current = None;
            }
        }
    }
    started
}

fn stop() {
    if let Ok(mut current) = running().lock() {
        if let Some(stopped) = current.take() {
            stopped.store(true, Ordering::Relaxed);
        }
    }
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

const RATE: u32 = 16_000;
/// A pause shorter than this is not a pause (the audio just arrived late).
const MIN_PAUSE: usize = RATE as usize / 2;
/// Longer pauses are cut to this: enough to end a phrase, no minutes of silence.
const MAX_PAUSE: usize = RATE as usize;
/// About 100 ms of audio per message to the webview.
const BATCH: usize = RATE as usize / 10;

/// Where the audio stands in time. Loopback delivers nothing while the computer is silent, so
/// pauses are put back (up to `MAX_PAUSE`): the transcription hears where speech stopped.
struct Timeline {
    /// Samples accounted for: sent, padded or skipped.
    position: usize,
    /// Silence added during the current pause.
    padded: usize,
}

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

/// Audio on its way to the webview: pauses put back, sent in batches.
struct Pump<F: Fn(SystemAudioEvent)> {
    send: F,
    started: Instant,
    timeline: Timeline,
    batch: Vec<f32>,
}

impl<F: Fn(SystemAudioEvent)> Pump<F> {
    fn new(send: F) -> Self {
        Self {
            send,
            started: Instant::now(),
            timeline: Timeline {
                position: 0,
                padded: 0,
            },
            batch: Vec::with_capacity(BATCH * 2),
        }
    }

    fn due(&self) -> usize {
        (self.started.elapsed().as_secs_f64() * f64::from(RATE)) as usize
    }

    fn audio(&mut self, samples: Vec<f32>) {
        let pad = self
            .timeline
            .pause_before(self.due().saturating_sub(samples.len()));
        self.batch.extend(std::iter::repeat_n(0.0, pad));
        self.timeline.audio(samples.len());
        self.batch.extend(samples);
        if self.batch.len() >= BATCH {
            self.flush();
        }
    }

    /// Nothing plays: let the pause be heard now, not when sound comes back.
    fn idle(&mut self) {
        let pad = self.timeline.pause_before(self.due());
        self.batch.extend(std::iter::repeat_n(0.0, pad));
        self.flush();
    }

    fn flush(&mut self) {
        if !self.batch.is_empty() {
            (self.send)(SystemAudioEvent::Chunk {
                data: encode(&self.batch),
            });
            self.batch.clear();
        }
    }

    fn error(&mut self, message: String) {
        self.flush();
        (self.send)(SystemAudioEvent::Error { message });
    }
}

#[cfg(windows)]
mod imp {
    use super::{Downsampler, Msg, Pump, Ready, SystemAudioEvent, RATE};
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{FromSample, SampleFormat, SizedSample};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    pub fn supported() -> bool {
        true
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

    pub fn run(send: impl Fn(SystemAudioEvent), stopped: Arc<AtomicBool>, ready: Ready) {
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
        let mut pump = Pump::new(send);
        let mut checked = Instant::now();

        while !stopped.load(Ordering::Relaxed) {
            let mut failure = None;
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Msg::Audio(samples)) => pump.audio(samples),
                Ok(Msg::Failed(message)) => failure = Some(message),
                Err(RecvTimeoutError::Timeout) => pump.idle(),
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
                pump.flush();
                drop(current);
                match reopen(&tx, &stopped) {
                    Some(open) => current = open,
                    None => {
                        pump.error(message);
                        return;
                    }
                }
            }
        }
        pump.flush();
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

/// macOS: a private Core Audio tap of everything the Mac plays (whatever the output device),
/// read through a private aggregate device. The tap API arrived in macOS 14.2, so it is looked up
/// when needed rather than linked: the app still starts on older versions, which get "unsupported".
#[cfg(target_os = "macos")]
mod imp {
    use super::{Downsampler, Msg, Pump, Ready, SystemAudioEvent, RATE};
    use objc2::msg_send;
    use objc2::rc::{autoreleasepool, Allocated, Retained};
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2_foundation::{NSArray, NSMutableDictionary, NSNumber, NSString};
    use std::ffi::{c_char, c_void, CStr};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    type OsStatus = i32;
    type ObjectId = u32;

    #[repr(C)]
    struct PropertyAddress {
        selector: u32,
        scope: u32,
        element: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct StreamDescription {
        sample_rate: f64,
        format_id: u32,
        format_flags: u32,
        bytes_per_packet: u32,
        frames_per_packet: u32,
        bytes_per_frame: u32,
        channels_per_frame: u32,
        bits_per_channel: u32,
        reserved: u32,
    }

    #[repr(C)]
    struct AudioBuffer {
        channels: u32,
        bytes: u32,
        data: *mut c_void,
    }

    #[repr(C)]
    struct AudioBufferList {
        count: u32,
        buffers: [AudioBuffer; 1],
    }

    type IoProc = unsafe extern "C" fn(
        ObjectId,
        *const c_void,
        *const AudioBufferList,
        *const c_void,
        *mut AudioBufferList,
        *const c_void,
        *mut c_void,
    ) -> OsStatus;

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyData(
            id: ObjectId,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
            data: *mut c_void,
        ) -> OsStatus;
        fn AudioHardwareCreateAggregateDevice(
            description: *const c_void,
            device: *mut ObjectId,
        ) -> OsStatus;
        fn AudioHardwareDestroyAggregateDevice(device: ObjectId) -> OsStatus;
        fn AudioDeviceCreateIOProcID(
            device: ObjectId,
            proc_: IoProc,
            client: *mut c_void,
            proc_id: *mut *mut c_void,
        ) -> OsStatus;
        fn AudioDeviceDestroyIOProcID(device: ObjectId, proc_id: *mut c_void) -> OsStatus;
        fn AudioDeviceStart(device: ObjectId, proc_id: *mut c_void) -> OsStatus;
        fn AudioDeviceStop(device: ObjectId, proc_id: *mut c_void) -> OsStatus;
    }

    extern "C" {
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    }
    const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

    type CreateTap = unsafe extern "C" fn(*mut AnyObject, *mut ObjectId) -> OsStatus;
    type DestroyTap = unsafe extern "C" fn(ObjectId) -> OsStatus;

    const fn fourcc(code: &[u8; 4]) -> u32 {
        u32::from_be_bytes(*code)
    }
    const SCOPE_GLOBAL: u32 = fourcc(b"glob");
    const TAP_FORMAT: u32 = fourcc(b"tfmt");
    const FORMAT_LINEAR_PCM: u32 = fourcc(b"lpcm");
    const FLAG_FLOAT: u32 = 1;
    const FLAG_NON_INTERLEAVED: u32 = 1 << 5;

    struct TapApi {
        create: CreateTap,
        destroy: DestroyTap,
    }

    fn tap_api() -> Option<TapApi> {
        AnyClass::get(c"CATapDescription")?;
        let find = |name: &CStr| unsafe { dlsym(RTLD_DEFAULT, name.as_ptr()) };
        let create = find(c"AudioHardwareCreateProcessTap");
        let destroy = find(c"AudioHardwareDestroyProcessTap");
        if create.is_null() || destroy.is_null() {
            return None;
        }
        // SAFETY: the symbols are CoreAudio's functions with these signatures (macOS 14.2+).
        unsafe {
            Some(TapApi {
                create: std::mem::transmute::<*mut c_void, CreateTap>(create),
                destroy: std::mem::transmute::<*mut c_void, DestroyTap>(destroy),
            })
        }
    }

    pub fn supported() -> bool {
        tap_api().is_some()
    }

    fn check(status: OsStatus, what: &str) -> Result<(), String> {
        if status == 0 {
            Ok(())
        } else {
            Err(format!("{what} failed ({status})"))
        }
    }

    /// What the audio thread needs; boxed so its address stays put for Core Audio.
    struct Context {
        tx: SyncSender<Msg>,
        channels: usize,
        interleaved: bool,
        down: Mutex<Downsampler>,
    }

    unsafe extern "C" fn io_proc(
        _device: ObjectId,
        _now: *const c_void,
        input: *const AudioBufferList,
        _input_time: *const c_void,
        _output: *mut AudioBufferList,
        _output_time: *const c_void,
        client: *mut c_void,
    ) -> OsStatus {
        if input.is_null() || client.is_null() {
            return 0;
        }
        let ctx = &*(client as *const Context);
        let count = (*input).count as usize;
        let first = std::ptr::addr_of!((*input).buffers) as *const AudioBuffer;
        let buffers: Vec<&[f32]> = (0..count)
            .map(|i| {
                let b = &*first.add(i);
                if b.data.is_null() {
                    &[][..]
                } else {
                    std::slice::from_raw_parts(b.data as *const f32, b.bytes as usize / 4)
                }
            })
            .collect();
        let Ok(mut down) = ctx.down.lock() else {
            return 0;
        };
        let mut out = Vec::new();
        if ctx.interleaved {
            let channels = ctx.channels.max(1);
            for buffer in &buffers {
                for frame in buffer.chunks(channels) {
                    down.push(frame.iter().sum::<f32>() / frame.len() as f32, &mut out);
                }
            }
        } else if let Some(frames) = buffers.iter().map(|b| b.len()).min() {
            // One buffer per channel: mix them.
            for i in 0..frames {
                let sum: f32 = buffers.iter().map(|b| b[i]).sum();
                down.push(sum / buffers.len() as f32, &mut out);
            }
        }
        if !out.is_empty() {
            let _ = ctx.tx.try_send(Msg::Audio(out));
        }
        0
    }

    /// The tap, the aggregate device reading it, and its IO proc; torn down in reverse on drop.
    struct Capture {
        api: TapApi,
        tap: ObjectId,
        device: ObjectId,
        proc_id: *mut c_void,
        context: Option<Box<Context>>,
    }

    impl Drop for Capture {
        fn drop(&mut self) {
            unsafe {
                if !self.proc_id.is_null() {
                    AudioDeviceStop(self.device, self.proc_id);
                    AudioDeviceDestroyIOProcID(self.device, self.proc_id);
                }
                if self.device != 0 {
                    AudioHardwareDestroyAggregateDevice(self.device);
                }
                (self.api.destroy)(self.tap);
            }
        }
    }

    fn open(tx: SyncSender<Msg>) -> Result<Capture, String> {
        let api = tap_api().ok_or("unsupported")?;
        autoreleasepool(|_| unsafe {
            // Everything the Mac plays, mixed to stereo, from no process in particular.
            let class = AnyClass::get(c"CATapDescription").ok_or("unsupported")?;
            let none = NSArray::<AnyObject>::new();
            let description: Allocated<AnyObject> = msg_send![class, alloc];
            let description: Option<Retained<AnyObject>> =
                msg_send![description, initStereoGlobalTapButExcludeProcesses: &*none];
            let description = description.ok_or("tap description")?;
            let _: () = msg_send![&*description, setPrivate: true];
            let name = NSString::from_str("FixNote call");
            let _: () = msg_send![&*description, setName: &*name];

            let mut tap: ObjectId = 0;
            check(
                (api.create)(Retained::as_ptr(&description) as *mut AnyObject, &mut tap),
                "creating the tap",
            )?;
            let mut capture = Capture {
                api,
                tap,
                device: 0,
                proc_id: std::ptr::null_mut(),
                context: None,
            };

            let uuid: Retained<AnyObject> = msg_send![&*description, UUID];
            let tap_uid: Retained<NSString> = msg_send![&*uuid, UUIDString];

            let mut format = StreamDescription::default();
            let mut size = std::mem::size_of::<StreamDescription>() as u32;
            let address = PropertyAddress {
                selector: TAP_FORMAT,
                scope: SCOPE_GLOBAL,
                element: 0,
            };
            check(
                AudioObjectGetPropertyData(
                    tap,
                    &address,
                    0,
                    std::ptr::null(),
                    &mut size,
                    std::ptr::addr_of_mut!(format).cast(),
                ),
                "reading the tap format",
            )?;
            if format.format_id != FORMAT_LINEAR_PCM
                || format.format_flags & FLAG_FLOAT == 0
                || format.bits_per_channel != 32
            {
                return Err("unsupported tap format".into());
            }
            let context = capture.context.insert(Box::new(Context {
                tx,
                channels: format.channels_per_frame as usize,
                interleaved: format.format_flags & FLAG_NON_INTERLEAVED == 0,
                down: Mutex::new(Downsampler::new(format.sample_rate as u32, RATE)),
            }));
            let client = std::ptr::addr_of!(**context) as *mut c_void;

            // A private aggregate device that reads the tap and nothing else.
            let sub_tap = NSMutableDictionary::<NSString, AnyObject>::new();
            set(&sub_tap, "uid", &*tap_uid);
            set(&sub_tap, "drift", &*NSNumber::new_bool(true));
            let taps = NSArray::from_retained_slice(&[sub_tap]);
            let properties = NSMutableDictionary::<NSString, AnyObject>::new();
            set(&properties, "name", &*NSString::from_str("FixNote call"));
            // Unique per recording: the last one may still be closing.
            static COUNT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
            let n = COUNT.fetch_add(1, Ordering::Relaxed);
            let uid = format!("space.fixnote.call.{}.{n}", std::process::id());
            set(&properties, "uid", &*NSString::from_str(&uid));
            set(&properties, "private", &*NSNumber::new_bool(true));
            set(&properties, "taps", &*taps);
            set(&properties, "tapautostart", &*NSNumber::new_bool(true));
            check(
                AudioHardwareCreateAggregateDevice(
                    Retained::as_ptr(&properties) as *const c_void,
                    &mut capture.device,
                ),
                "creating the aggregate device",
            )?;

            check(
                AudioDeviceCreateIOProcID(capture.device, io_proc, client, &mut capture.proc_id),
                "reading the aggregate device",
            )?;
            check(
                AudioDeviceStart(capture.device, capture.proc_id),
                "starting the aggregate device",
            )?;
            Ok(capture)
        })
    }

    /// `dict[key] = value` for Foundation objects.
    unsafe fn set<T: objc2::Message>(
        dict: &NSMutableDictionary<NSString, AnyObject>,
        key: &str,
        value: &T,
    ) {
        let key = NSString::from_str(key);
        let _: () = msg_send![dict, setObject: value, forKey: &*key];
    }

    pub fn run(send: impl Fn(SystemAudioEvent), stopped: Arc<AtomicBool>, ready: Ready) {
        let (tx, rx) = mpsc::sync_channel::<Msg>(512);
        let capture = match open(tx) {
            Ok(capture) => {
                let _ = ready.send(Ok(()));
                capture
            }
            Err(e) => {
                let _ = ready.send(Err(e));
                return;
            }
        };
        let mut pump = Pump::new(send);
        while !stopped.load(Ordering::Relaxed) {
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(Msg::Audio(samples)) => pump.audio(samples),
                Ok(Msg::Failed(message)) => {
                    pump.error(message);
                    break;
                }
                Err(RecvTimeoutError::Timeout) => pump.idle(),
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        drop(capture);
        pump.flush();
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod imp {
    use super::{Ready, SystemAudioEvent};
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    pub fn supported() -> bool {
        false
    }

    pub fn run(_send: impl Fn(SystemAudioEvent), _stopped: Arc<AtomicBool>, ready: Ready) {
        let _ = ready.send(Err("unsupported".into()));
    }
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

    #[test]
    fn pump_batches_and_puts_back_pauses() {
        let sent = std::cell::RefCell::new(Vec::<String>::new());
        let mut pump = Pump::new(|e| {
            if let SystemAudioEvent::Chunk { data } = e {
                sent.borrow_mut().push(data);
            }
        });
        pump.audio(vec![0.1; 800]);
        assert!(sent.borrow().is_empty());
        pump.audio(vec![0.1; 800]);
        assert_eq!(sent.borrow().len(), 1);
        pump.flush();
        assert_eq!(sent.borrow().len(), 1);
    }
}

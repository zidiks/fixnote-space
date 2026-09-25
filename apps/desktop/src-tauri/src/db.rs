//! Generic SQLite access for the UI. The schema and every query live in packages/core; this module
//! only moves SQL and values across the IPC boundary over one connection.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde_json::{json, Map, Value};

/// Blobs cross IPC as `{"$blob": [u8, ...]}`; JSON has no binary type.
const BLOB_KEY: &str = "$blob";

pub struct Db(pub Mutex<Connection>);

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(conn)
}

fn to_sql(value: &Value) -> Result<SqlValue, String> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().ok_or("number out of range")?),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Object(o) => match o.get(BLOB_KEY) {
            Some(Value::Array(bytes)) => SqlValue::Blob(
                bytes
                    .iter()
                    .map(|b| {
                        b.as_u64()
                            .and_then(|b| u8::try_from(b).ok())
                            .ok_or("blob byte out of range")
                    })
                    .collect::<Result<_, _>>()?,
            ),
            _ => return Err("unsupported object parameter".into()),
        },
        Value::Array(_) => return Err("array parameters are not supported".into()),
    })
}

fn from_sql(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => json!({ BLOB_KEY: b }),
    }
}

fn bind(params: &[Value]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(to_sql).collect()
}

/// Runs one statement to completion and returns the number of changed rows.
/// Statements that yield rows (some PRAGMAs) are fine; the rows are discarded.
pub fn execute(conn: &Connection, sql: &str, params: &[Value]) -> Result<u64, String> {
    let values = bind(params)?;
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params_from_iter(values))
        .map_err(|e| e.to_string())?;
    while rows.next().map_err(|e| e.to_string())?.is_some() {}
    Ok(conn.changes())
}

pub fn query(
    conn: &Connection,
    sql: &str,
    params: &[Value],
) -> Result<Vec<Map<String, Value>>, String> {
    let values = bind(params)?;
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let mut rows = stmt
        .query(params_from_iter(values))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = Map::with_capacity(names.len());
        for (i, name) in names.iter().enumerate() {
            obj.insert(
                name.clone(),
                from_sql(row.get_ref(i).map_err(|e| e.to_string())?),
            );
        }
        out.push(obj);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    #[test]
    fn round_trips_values() {
        let c = mem();
        execute(
            &c,
            "CREATE TABLE t (i INTEGER, r REAL, s TEXT, b BLOB, n)",
            &[],
        )
        .unwrap();
        let changed = execute(
            &c,
            "INSERT INTO t VALUES (?, ?, ?, ?, ?)",
            &[
                json!(42),
                json!(1.5),
                json!("héllo"),
                json!({ "$blob": [0, 255, 7] }),
                Value::Null,
            ],
        )
        .unwrap();
        assert_eq!(changed, 1);
        let rows = query(&c, "SELECT * FROM t", &[]).unwrap();
        assert_eq!(
            Value::Object(rows[0].clone()),
            json!({ "i": 42, "r": 1.5, "s": "héllo", "b": { "$blob": [0, 255, 7] }, "n": null })
        );
    }

    #[test]
    fn has_fts5_with_unicode_tokenizer() {
        let c = mem();
        execute(
            &c,
            "CREATE VIRTUAL TABLE f USING fts5(body, tokenize = 'unicode61 remove_diacritics 2')",
            &[],
        )
        .unwrap();
        execute(
            &c,
            "INSERT INTO f VALUES (?), (?)",
            &[json!("Привет мир"), json!("Canción")],
        )
        .unwrap();
        let hits = query(
            &c,
            "SELECT body FROM f WHERE f MATCH ?",
            &[json!("\"прив\"*")],
        )
        .unwrap();
        assert_eq!(hits.len(), 1);
        let hits = query(
            &c,
            "SELECT body FROM f WHERE f MATCH ?",
            &[json!("\"cancion\"*")],
        )
        .unwrap();
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn execute_tolerates_statements_that_return_rows() {
        let c = mem();
        execute(&c, "PRAGMA user_version = 3", &[]).unwrap();
        execute(&c, "PRAGMA journal_mode", &[]).unwrap();
        let rows = query(&c, "PRAGMA user_version", &[]).unwrap();
        assert_eq!(rows[0]["user_version"], json!(3));
    }

    #[test]
    fn transactions_span_calls_on_one_connection() {
        let c = mem();
        execute(&c, "CREATE TABLE t (x)", &[]).unwrap();
        execute(&c, "BEGIN IMMEDIATE", &[]).unwrap();
        execute(&c, "INSERT INTO t VALUES (1)", &[]).unwrap();
        execute(&c, "ROLLBACK", &[]).unwrap();
        assert!(query(&c, "SELECT * FROM t", &[]).unwrap().is_empty());
    }

    #[test]
    fn rejects_bad_parameters() {
        let c = mem();
        assert!(execute(&c, "SELECT ?", &[json!([1, 2])]).is_err());
        assert!(execute(&c, "SELECT ?", &[json!({ "$blob": [256] })]).is_err());
        assert!(execute(&c, "SELEKT", &[]).is_err());
    }
}

// 绯绯狐工具箱的 exe 外壳（2026-11-04 用户决定改用 Rust 打包，不再带 Python）。
//
// 工具箱本身是静态站点（tools/build_site.mjs → build/site），编译时嵌进 exe，用系统自带的 WebView2 显示。
// 计算都在页面里；这里只做三件事：
//   1. read_store / write_store：读写 exe 旁边的 userdata/<名字>.json。文件名和以前 Python 版一样
//      （honkai-star-rail/speed-plan-presets.json、honkai-star-rail/aha-team-presets.json、ui-state.json），
//      老用户把 userdata 文件夹拷过来就能接着用，复制这个文件夹就是备份；
//   2. open_external：外部链接（b站主页、GitHub）用系统默认浏览器打开；
//   3. fetch_showcase：UID 查询，向 Enka 要展柜数据（网页请求会被跨域拦下，所以由 exe 发；B站 Toy 版没有这个功能）；
//   4. 不弹控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// userdata 目录：exe 旁边。开发时（cargo run）也是可执行文件旁边。
fn userdata_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("找不到程序所在的文件夹：{e}"))?;
    let dir = exe.parent().ok_or("找不到程序所在的文件夹")?.join("userdata");
    Ok(dir)
}

/// 存档名只能是 字母数字_- 组成的一段或几段路径（和以前 Python 版的页面状态名称规则一样），不能跳出 userdata。
fn store_path(name: &str) -> Result<PathBuf, String> {
    let valid = !name.is_empty()
        && name.len() <= 120
        && name.split('/').all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
    if !valid {
        return Err(format!("存档名称不对：{name}"));
    }
    let mut path = userdata_dir()?;
    for part in name.split('/') {
        path.push(part);
    }
    path.set_extension("json");
    Ok(path)
}

#[tauri::command]
fn read_store(name: String) -> Result<Option<String>, String> {
    let path = store_path(&name)?;
    match fs::read(&path) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).trim_start_matches('\u{feff}').to_string())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("读不了存档 {}：{e}", path.display())),
    }
}

/// 先写临时文件再改名：写到一半断电也不会留下半个文件。内容必须是 JSON，免得写坏存档。
#[tauri::command]
fn write_store(name: String, text: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("存档内容不是 JSON：{e}"))?;
    let path = store_path(&name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("建不了文件夹 {}：{e}", parent.display()))?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text.as_bytes()).map_err(|e| format!("写不了存档 {}：{e}", tmp.display()))?;
    fs::rename(&tmp, &path).map_err(|e| format!("写不了存档 {}：{e}", path.display()))?;
    Ok(())
}

/// 外部链接交给系统默认浏览器。只放行 http/https。
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.contains(['"', '\n', '\r']) {
        return Err(format!("只能打开网页链接：{url}"));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("打不开链接：{e}"))?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| format!("打不开链接：{e}"))?;
    }
    Ok(())
}

// ---- UID 查询（Enka） ---- //

const ENKA: &str = "https://enka.network/api/hsr/uid/";

/// 同一个 UID 在 Enka 返回的 ttl 秒内不重复请求（Enka 的要求），直接用上次的结果。
static SHOWCASE_CACHE: Mutex<Option<HashMap<String, (Instant, String)>>> = Mutex::new(None);

fn check_uid(uid: &str) -> Result<(), String> {
    if (9..=10).contains(&uid.len()) && uid.chars().all(|c| c.is_ascii_digit()) {
        Ok(())
    } else {
        Err(format!("UID 是 9 到 10 位数字，收到的是「{uid}」。"))
    }
}

/// Enka 的状态码说成人话。retry 是 429 时建议等待的秒数。
fn status_message(code: u16, retry: u64) -> String {
    match code {
        400 => "UID 格式不对，请检查一下。".to_string(),
        404 => "查不到这个 UID：确认 UID 没输错，并且游戏里「展柜」已经公开。".to_string(),
        424 => "游戏正在维护，维护结束后再查。".to_string(),
        429 => format!("查得太频繁，请 {retry} 秒后再试。"),
        _ => format!("Enka 暂时出错了（{code}），稍后再试，或者改用导入文件。"),
    }
}

/// 返回里的 ttl（秒）；读不到按 60 秒。
fn ttl_of(body: &str) -> u64 {
    serde_json::from_str::<serde_json::Value>(body).ok().and_then(|v| v.get("ttl").and_then(|t| t.as_u64())).unwrap_or(60)
}

fn request_showcase(uid: &str) -> Result<String, String> {
    let now = Instant::now();
    if let Some((until, body)) = SHOWCASE_CACHE.lock().ok().and_then(|cache| cache.as_ref().and_then(|map| map.get(uid).cloned())) {
        if now < until {
            return Ok(body);
        }
    }
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).build();
    let response = agent
        .get(&format!("{ENKA}{uid}"))
        .set("User-Agent", concat!("feifeifox-toolbox/", env!("CARGO_PKG_VERSION")))
        .call();
    let body = match response {
        Ok(resp) => resp.into_string().map_err(|e| format!("Enka 返回的内容读不出来：{e}"))?,
        Err(ureq::Error::Status(code, resp)) => {
            let retry = resp.header("Retry-After").and_then(|v| v.parse().ok()).unwrap_or(60);
            return Err(status_message(code, retry));
        }
        Err(_) => return Err("连不上 Enka（网络不通或被拦），稍后再试，或者改用导入文件。".to_string()),
    };
    let until = now + Duration::from_secs(ttl_of(&body));
    if let Ok(mut cache) = SHOWCASE_CACHE.lock() {
        cache.get_or_insert_with(HashMap::new).insert(uid.to_string(), (until, body.clone()));
    }
    Ok(body)
}

/// 页面调用：返回 Enka 的原始 JSON 文本，转换和合并在页面那边做（ui-shared/src/import/enka.ts）。
#[tauri::command]
async fn fetch_showcase(uid: String) -> Result<String, String> {
    let uid = uid.trim().to_string();
    check_uid(&uid)?;
    tauri::async_runtime::spawn_blocking(move || request_showcase(&uid))
        .await
        .map_err(|e| format!("UID 查询没有完成：{e}"))?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_store, write_store, open_external, fetch_showcase])
        .run(tauri::generate_context!())
        .expect("绯绯狐工具箱启动失败");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uid_validation() {
        assert!(check_uid("12345").is_err());
        assert!(check_uid("abc123456").is_err());
        assert!(check_uid("12345678901").is_err());
        assert!(check_uid("102304752").is_ok());
        assert!(check_uid("1023047520").is_ok());
    }

    #[test]
    fn status_messages_are_plain() {
        assert!(status_message(400, 0).contains("UID 格式不对"));
        assert!(status_message(404, 0).contains("展柜"));
        assert!(status_message(424, 0).contains("维护"));
        assert!(status_message(429, 30).contains("30 秒"));
        assert!(status_message(503, 0).contains("稍后再试"));
    }

    #[test]
    fn ttl_from_body() {
        assert_eq!(ttl_of(r#"{"ttl": 60, "uid": "1"}"#), 60);
        assert_eq!(ttl_of("{}"), 60);
        assert_eq!(ttl_of("not json"), 60);
    }
}

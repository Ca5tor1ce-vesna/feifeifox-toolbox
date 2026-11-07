// exe 自动更新（1.3，2026-11-06 用户定的做法）。
//
// 不用 Tauri 的更新插件：它在 Windows 上只支持安装版，我们是免安装 exe。自己做的流程：
//   1. 打开 exe 后页面调 check_update：按顺序试公开仓库 Release 和两个镜像上的版本清单 latest.json
//      （tools/update_sign.mjs 在发版时生成），都连不上就当没有新版，不打扰用户；
//   2. 有新版时页面用外壳的弹窗问「更新并重启 / 以后再说」；
//   3. install_update：先确认 exe 所在文件夹能写，下载 -update.exe，用编进 exe 的公钥校验 minisign 签名
//      （可信注释里的版本号和文件名也要对得上清单），再替换自己：
//      运行中的 exe 不能覆盖，但可以改名 —— 旧 exe 改名为 .old，新 exe 放到原来的名字，带 --updated 启动新 exe，自己退出；
//   4. 新 exe 启动时删掉 .old（带 --updated 时等旧进程退出、.old 删得掉再开窗口，免得两个进程抢同一份 WebView2 数据）。
// exe 旁边的 userdata/ 不碰。网络地址只写在这里：B站 Toy 包里不能出现 GitHub 和镜像地址。
use std::cmp::Ordering;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use minisign_verify::{PublicKey, Signature};

/// 发版签名的公钥（tools/update_sign.mjs keygen 生成；私钥在公开仓库的 Secret UPDATE_SIGNING_KEY）。
/// 换这把钥匙，老版本的 exe 就收不了新版的更新，只能手动下载一次。
const UPDATE_PUBLIC_KEY: &str = "RWSj9rsR6RniCyxo8hqc181l9teLMysyAlyWEHyc9HmM57hsJR+IiBkH";

const RELEASES: &str = "https://github.com/Ca5tor1ce-vesna/feifeifox-toolbox/releases";
/// 按顺序试：直连、两个镜像（国内连 GitHub 常常慢或连不上）。镜像不可信也没关系：下载的文件要过签名。
const MIRRORS: [(&str, &str); 3] = [("GitHub", ""), ("ghfast.top", "https://ghfast.top/"), ("gh-proxy.com", "https://gh-proxy.com/")];
/// 本机测试用：设了这个环境变量，就只从这个地址拿 latest.json 和 exe（签名照样要对）。
const BASE_ENV: &str = "FEIFEIFOX_UPDATE_BASE";
/// 新 exe 启动时带的参数：等旧进程退出、删掉 .old 再开窗口。
pub const UPDATED_ARG: &str = "--updated";
const MANIFEST: &str = "latest.json";
const MAX_SIZE: u64 = 200 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq)]
pub struct Manifest {
    pub version: String,
    pub date: String,
    pub notes: String,
    pub file: String,
    pub size: u64,
    pub signature: String,
}

/// 一个下载来源：版本清单的地址，和按清单拼出 exe 地址的办法。
#[derive(Clone, Debug, PartialEq)]
struct Source {
    manifest: String,
    file_base: Option<String>, // Some：exe 和清单在同一个文件夹（本机测试）；None：GitHub Release 的下载地址
    prefix: String,
}

impl Source {
    fn file_url(&self, manifest: &Manifest) -> String {
        match &self.file_base {
            Some(base) => format!("{base}/{}", manifest.file),
            None => format!("{}{RELEASES}/download/v{}/{}", self.prefix, manifest.version, manifest.file),
        }
    }
}

fn sources(base: Option<String>) -> Vec<Source> {
    if let Some(base) = base.map(|b| b.trim().trim_end_matches('/').to_string()).filter(|b| !b.is_empty()) {
        return vec![Source { manifest: format!("{base}/{MANIFEST}"), file_base: Some(base), prefix: String::new() }];
    }
    MIRRORS
        .iter()
        .map(|(_, prefix)| Source { manifest: format!("{prefix}{RELEASES}/latest/download/{MANIFEST}"), file_base: None, prefix: prefix.to_string() })
        .collect()
}

/// 版本号比大小：数字部分逐段比，同样数字时带后缀（1.3.0-beta.1）的比正式版小。
pub fn compare_versions(a: &str, b: &str) -> Ordering {
    fn split(v: &str) -> (Vec<u64>, Option<&str>) {
        let v = v.trim().trim_start_matches('v');
        let (core, pre) = match v.split_once('-') {
            Some((core, pre)) => (core, Some(pre)),
            None => (v, None),
        };
        (core.split('.').map(|part| part.parse().unwrap_or(0)).collect(), pre)
    }
    let (mut na, pa) = split(a);
    let (mut nb, pb) = split(b);
    let len = na.len().max(nb.len());
    na.resize(len, 0);
    nb.resize(len, 0);
    na.cmp(&nb).then_with(|| match (pa, pb) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(x), Some(y)) => x.cmp(y),
    })
}

fn valid_version(v: &str) -> bool {
    !v.is_empty() && v.len() <= 40 && v.chars().next().is_some_and(|c| c.is_ascii_digit()) && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

/// 读版本清单。文件名只能是一段普通的 .exe 名字（不能带路径），大小要合理。
pub fn parse_manifest(text: &str) -> Result<Manifest, String> {
    let value: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| format!("版本清单不是 JSON：{e}"))?;
    let text_of = |key: &str| value.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let manifest = Manifest {
        version: text_of("version"),
        date: text_of("date"),
        notes: text_of("notes"),
        file: text_of("file"),
        size: value.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
        signature: text_of("signature"),
    };
    if !valid_version(&manifest.version) {
        return Err(format!("版本清单里的版本号不对：「{}」", manifest.version));
    }
    let file_ok = manifest.file.len() <= 120
        && manifest.file.to_ascii_lowercase().ends_with(".exe")
        && manifest.file.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        && !manifest.file.starts_with('.');
    if !file_ok {
        return Err(format!("版本清单里的文件名不对：「{}」", manifest.file));
    }
    if manifest.size == 0 || manifest.size > MAX_SIZE {
        return Err(format!("版本清单里的文件大小不对：{}", manifest.size));
    }
    if manifest.signature.is_empty() {
        return Err("版本清单里没有签名".to_string());
    }
    Ok(manifest)
}

/// 校验下载的 exe：大小、minisign 签名，以及签名里的可信注释（version:<版本>\tfile:<文件名>）和清单一致。
pub fn verify_download(bytes: &[u8], manifest: &Manifest, public_key: &str) -> Result<(), String> {
    const BAD: &str = "下载的新版没通过签名校验（文件可能不完整或被改过），没有替换。";
    if bytes.len() as u64 != manifest.size {
        return Err(format!("下载的新版大小不对（{} 字节，应为 {}），可能没下完整，没有替换。", bytes.len(), manifest.size));
    }
    let key = PublicKey::from_base64(public_key).map_err(|_| "exe 里的更新公钥坏了".to_string())?;
    let signature = Signature::decode(&manifest.signature).map_err(|_| BAD.to_string())?;
    key.verify(bytes, &signature, false).map_err(|_| BAD.to_string())?;
    let mut fields = signature.trusted_comment().split(['\t', ' ']).filter_map(|part| part.split_once(':'));
    let comment_version = fields.clone().find(|(k, _)| *k == "version").map(|(_, v)| v);
    let comment_file = fields.find(|(k, _)| *k == "file").map(|(_, v)| v);
    if comment_version != Some(manifest.version.as_str()) || comment_file != Some(manifest.file.as_str()) {
        return Err(BAD.to_string());
    }
    Ok(())
}

// ---- 文件夹和替换 ---- //

fn sibling(exe: &Path, suffix: &str) -> PathBuf {
    let mut name = exe.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    exe.with_file_name(name)
}

/// 真的写一个文件试试：只看只读属性不准（Program Files 不是只读，但普通权限写不进去）。
pub fn dir_writable(dir: &Path) -> bool {
    let probe = dir.join(".feifeifox-update-check.tmp");
    let ok = fs::OpenOptions::new().write(true).create_new(true).open(&probe).and_then(|mut f| std::io::Write::write_all(&mut f, b"ok")).is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

/// 换掉 exe：新文件先写成 .new，旧 exe 改名为 .old，再把 .new 改成原来的名字。中途失败就尽量恢复原样。
pub fn replace_exe(exe: &Path, bytes: &[u8]) -> Result<(), String> {
    let new = sibling(exe, ".new");
    let old = sibling(exe, ".old");
    fs::write(&new, bytes).map_err(|e| format!("写不了新版文件 {}：{e}", new.display()))?;
    match fs::remove_file(&old) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => {
            let _ = fs::remove_file(&new);
            return Err(format!("删不掉上次更新留下的 {}：{e}", old.display()));
        }
    }
    if let Err(e) = fs::rename(exe, &old) {
        let _ = fs::remove_file(&new);
        return Err(format!("没法把旧版改名（{e}），没有替换。"));
    }
    if let Err(e) = fs::rename(&new, exe) {
        let _ = fs::rename(&old, exe);
        let _ = fs::remove_file(&new);
        return Err(format!("没法放入新版（{e}），已恢复旧版。"));
    }
    Ok(())
}

/// 启动时删掉上次更新留下的 .old。刚更新完（wait 为 true）时旧进程可能还没退出、文件还锁着，最多等 15 秒。
pub fn remove_old(exe: &Path, wait: bool) {
    let old = sibling(exe, ".old");
    let until = Instant::now() + Duration::from_secs(if wait { 15 } else { 0 });
    loop {
        match fs::remove_file(&old) {
            Ok(()) => return,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
            Err(_) if Instant::now() < until => std::thread::sleep(Duration::from_millis(200)),
            Err(_) => return,
        }
    }
}

// ---- 网络 ---- //

fn agent(read_secs: u64) -> ureq::Agent {
    ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(6)).timeout_read(Duration::from_secs(read_secs)).build()
}

fn get(agent: &ureq::Agent, url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let response = agent.get(url).set("User-Agent", concat!("feifeifox-toolbox/", env!("CARGO_PKG_VERSION"))).call().map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    response.into_reader().take(limit + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("文件太大".to_string());
    }
    Ok(bytes)
}

/// 找到的新版和是从第几个来源拿到的清单（下载时先试同一个来源）。
static PENDING: Mutex<Option<(Manifest, Vec<Source>, usize)>> = Mutex::new(None);
static INSTALLING: AtomicBool = AtomicBool::new(false);

fn current_exe() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("找不到程序所在的文件夹：{e}"))
}

/// 页面调用：有新版时返回 { version, current, date, notes, writable }，没有新版或都连不上时返回 null（不报错，不打扰）。
#[tauri::command]
pub async fn check_update() -> Result<Option<serde_json::Value>, String> {
    let base = std::env::var(BASE_ENV).ok();
    // 开发时（cargo run 的调试版）不去查，除非指定了测试地址。
    if cfg!(debug_assertions) && base.is_none() {
        return Ok(None);
    }
    let list = sources(base);
    let found = tauri::async_runtime::spawn_blocking(move || {
        let agent = agent(10);
        for (index, source) in list.iter().enumerate() {
            let Ok(bytes) = get(&agent, &source.manifest, 1024 * 1024) else { continue };
            let Ok(manifest) = parse_manifest(&String::from_utf8_lossy(&bytes)) else { continue };
            return Some((manifest, list, index));
        }
        None
    })
    .await
    .map_err(|e| format!("检查更新没有完成：{e}"))?;
    let Some((manifest, list, index)) = found else { return Ok(None) };
    if compare_versions(&manifest.version, env!("CARGO_PKG_VERSION")) != Ordering::Greater {
        return Ok(None);
    }
    let exe = current_exe()?;
    let writable = exe.parent().is_some_and(dir_writable);
    let info = serde_json::json!({ "version": manifest.version, "current": env!("CARGO_PKG_VERSION"), "date": manifest.date, "notes": manifest.notes, "writable": writable });
    if let Ok(mut pending) = PENDING.lock() {
        *pending = Some((manifest, list, index));
    }
    Ok(Some(info))
}

fn download_and_replace() -> Result<PathBuf, String> {
    let (manifest, list, first) = PENDING.lock().ok().and_then(|p| p.clone()).ok_or("没有可以安装的新版，重新打开工具箱再试。")?;
    let exe = current_exe()?;
    let dir = exe.parent().ok_or("找不到程序所在的文件夹")?;
    if !dir_writable(dir) {
        return Err(format!("工具箱所在的文件夹（{}）不能写入，没法自动更新。", dir.display()));
    }
    let agent = agent(30);
    let order = std::iter::once(first).chain((0..list.len()).filter(|i| *i != first));
    let mut last = String::from("连不上下载地址");
    for index in order {
        let bytes = match get(&agent, &list[index].file_url(&manifest), manifest.size) {
            Ok(bytes) => bytes,
            Err(e) => {
                last = format!("下载失败：{e}");
                continue;
            }
        };
        // 签名不对的来源换下一个试（镜像可能给了坏文件），都不对才报错。
        if let Err(e) = verify_download(&bytes, &manifest, UPDATE_PUBLIC_KEY) {
            last = e;
            continue;
        }
        replace_exe(&exe, &bytes)?;
        return Ok(exe);
    }
    Err(last)
}

/// 页面调用：下载、校验、替换，然后启动新版并退出。失败时返回说明，旧版照常用。
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    if INSTALLING.swap(true, AtomicOrdering::SeqCst) {
        return Err("正在更新，请稍等。".to_string());
    }
    let result = tauri::async_runtime::spawn_blocking(download_and_replace).await.map_err(|e| format!("更新没有完成：{e}")).and_then(|r| r);
    let exe = match result {
        Ok(exe) => exe,
        Err(e) => {
            INSTALLING.store(false, AtomicOrdering::SeqCst);
            return Err(e);
        }
    };
    let mut command = std::process::Command::new(&exe);
    command.arg(UPDATED_ARG);
    if let Some(dir) = exe.parent() {
        command.current_dir(dir);
    }
    if let Err(e) = command.spawn() {
        INSTALLING.store(false, AtomicOrdering::SeqCst);
        return Err(format!("新版已经放好，但没能自动启动（{e}），请关掉工具箱后重新打开。"));
    }
    app.exit(0);
    Ok(())
}

/// 页面调用：用系统浏览器打开最新版的下载页（自动更新不了时手动下载）。
#[tauri::command]
pub fn open_release_page() -> Result<(), String> {
    crate::open_external(format!("{RELEASES}/latest"))
}

#[cfg(test)]
mod tests {
    use super::*;

    // 测试用的一次性密钥签的（不是发版那把）：内容 "feifeifox test exe"。
    const TEST_KEY: &str = "RWQCUbHfQfsFLhPJbX34GFDrd0aNZeTbtqNgdVqsUnkag/A8B/gJFS2n";
    const OTHER_KEY: &str = "RWTNKT/kvnJRIK0YQ5GAdp6GeB4sYzKuAF+jvm+PvMD5BKl6UJAhBlx+";
    const TEST_SIG: &str = "untrusted comment: feifeifox-toolbox update signature 0251B1DF41FB052E\nRUQCUbHfQfsFLlqCMj0IJng3VYyaSCXeQOTU7DzkFcr+Cwsa9PF+pom3ehNS2JTt2DO0OOKTqmqo/Gt1dv3MQhwzSFgb+MMDdgc=\ntrusted comment: version:9.9.9\tfile:feifeifox-toolbox-v9.9.9-update.exe\nDA0Bex+frpfn9rDPbQfk1ivaeQB/GcJ69pd9P13AkvTK1CKNT/V9ddGkkzH7CikMSQek1cozIS+qIwiMOaMZCw==\n";
    const TEST_BYTES: &[u8] = b"feifeifox test exe";

    fn manifest() -> Manifest {
        Manifest {
            version: "9.9.9".into(),
            date: "2026-11-06".into(),
            notes: "- 修复已知 bug。".into(),
            file: "feifeifox-toolbox-v9.9.9-update.exe".into(),
            size: TEST_BYTES.len() as u64,
            signature: TEST_SIG.into(),
        }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("feifeifox-update-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn versions_compare_by_number_then_suffix() {
        assert_eq!(compare_versions("1.3.0", "1.2.3"), Ordering::Greater);
        assert_eq!(compare_versions("1.10.0", "1.9.9"), Ordering::Greater);
        assert_eq!(compare_versions("1.2.3", "1.2.3"), Ordering::Equal);
        assert_eq!(compare_versions("v1.2.3", "1.2.3"), Ordering::Equal);
        assert_eq!(compare_versions("1.2", "1.2.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.2.2", "1.2.3"), Ordering::Less);
        assert_eq!(compare_versions("1.3.0-beta.1", "1.3.0"), Ordering::Less);
        assert_eq!(compare_versions("1.3.0-beta.1", "1.2.3"), Ordering::Greater);
    }

    #[test]
    fn manifest_parsing_rejects_bad_fields() {
        let good = serde_json::json!({ "version": "9.9.9", "date": "2026-11-06", "notes": "- 修复已知 bug。", "file": "feifeifox-toolbox-v9.9.9-update.exe", "size": TEST_BYTES.len(), "signature": TEST_SIG });
        assert_eq!(parse_manifest(&good.to_string()).unwrap(), manifest());
        assert_eq!(parse_manifest(&format!("\u{feff}{good}")).unwrap(), manifest());
        let with = |key: &str, value: serde_json::Value| {
            let mut v = good.clone();
            v[key] = value;
            parse_manifest(&v.to_string())
        };
        assert!(with("version", "".into()).unwrap_err().contains("版本号"));
        assert!(with("version", "1.3.0<script>".into()).is_err());
        assert!(with("file", "../FeifeiFoxToolbox.exe".into()).unwrap_err().contains("文件名"));
        assert!(with("file", "C:\\x.exe".into()).is_err());
        assert!(with("file", "update.zip".into()).is_err());
        assert!(with("size", 0.into()).unwrap_err().contains("大小"));
        assert!(with("size", (MAX_SIZE + 1).into()).is_err());
        assert!(with("signature", "".into()).unwrap_err().contains("签名"));
        assert!(parse_manifest("<html>").unwrap_err().contains("JSON"));
    }

    #[test]
    fn signature_must_match_key_bytes_and_comment() {
        assert_eq!(verify_download(TEST_BYTES, &manifest(), TEST_KEY), Ok(()));
        // 内容被改
        let mut tampered = TEST_BYTES.to_vec();
        tampered[0] ^= 1;
        assert!(verify_download(&tampered, &manifest(), TEST_KEY).unwrap_err().contains("签名校验"));
        // 大小不对（没下完）
        assert!(verify_download(&TEST_BYTES[1..], &manifest(), TEST_KEY).unwrap_err().contains("大小不对"));
        // 别的钥匙签的
        assert!(verify_download(TEST_BYTES, &manifest(), OTHER_KEY).unwrap_err().contains("签名校验"));
        // 清单把版本号或文件名改了，和签名里的可信注释对不上
        let other_version = Manifest { version: "9.9.10".into(), ..manifest() };
        assert!(verify_download(TEST_BYTES, &other_version, TEST_KEY).is_err());
        let other_file = Manifest { file: "other.exe".into(), ..manifest() };
        assert!(verify_download(TEST_BYTES, &other_file, TEST_KEY).is_err());
        // 签名文字坏了
        let broken = Manifest { signature: "not a signature".into(), ..manifest() };
        assert!(verify_download(TEST_BYTES, &broken, TEST_KEY).is_err());
        // 发版公钥本身能读
        assert!(PublicKey::from_base64(UPDATE_PUBLIC_KEY).is_ok());
    }

    #[test]
    fn sources_try_release_then_mirrors_or_only_local_base() {
        let list = sources(None);
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].manifest, format!("{RELEASES}/latest/download/latest.json"));
        assert_eq!(list[1].manifest, format!("https://ghfast.top/{RELEASES}/latest/download/latest.json"));
        assert_eq!(list[1].file_url(&manifest()), format!("https://ghfast.top/{RELEASES}/download/v9.9.9/feifeifox-toolbox-v9.9.9-update.exe"));
        let local = sources(Some("http://127.0.0.1:8961/ ".into()));
        assert_eq!(local.len(), 1);
        assert_eq!(local[0].manifest, "http://127.0.0.1:8961/latest.json");
        assert_eq!(local[0].file_url(&manifest()), "http://127.0.0.1:8961/feifeifox-toolbox-v9.9.9-update.exe");
        assert_eq!(sources(Some("  ".into())).len(), 3);
    }

    #[test]
    fn replace_keeps_userdata_and_leaves_old_for_next_start() {
        let dir = temp_dir("replace");
        let exe = dir.join("FeifeiFoxToolbox.exe");
        fs::write(&exe, b"old exe").unwrap();
        fs::create_dir_all(dir.join("userdata")).unwrap();
        fs::write(dir.join("userdata").join("roster.json"), b"{}").unwrap();
        fs::write(sibling(&exe, ".old"), b"older exe").unwrap();
        replace_exe(&exe, b"new exe").unwrap();
        assert_eq!(fs::read(&exe).unwrap(), b"new exe");
        assert_eq!(fs::read(sibling(&exe, ".old")).unwrap(), b"old exe");
        assert!(!sibling(&exe, ".new").exists());
        assert_eq!(fs::read(dir.join("userdata").join("roster.json")).unwrap(), b"{}");
        remove_old(&exe, false);
        assert!(!sibling(&exe, ".old").exists());
        remove_old(&exe, true); // 没有 .old 时直接返回
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn replace_without_exe_restores_nothing_and_cleans_new() {
        let dir = temp_dir("missing");
        let exe = dir.join("FeifeiFoxToolbox.exe");
        assert!(replace_exe(&exe, b"new exe").unwrap_err().contains("改名"));
        assert!(!sibling(&exe, ".new").exists());
        assert!(!exe.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn writable_probe_leaves_no_file() {
        let dir = temp_dir("writable");
        assert!(dir_writable(&dir));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        assert!(!dir_writable(&dir.join("does-not-exist")));
        let _ = fs::remove_dir_all(&dir);
    }
}

fn main() {
    // 站点（tools/build_site.mjs → build/site）在编译时嵌进 exe：站点变了要重新编译，否则 exe 里还是旧页面。
    println!("cargo:rerun-if-changed=../build/site");
    tauri_build::build()
}

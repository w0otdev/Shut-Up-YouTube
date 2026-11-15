"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

function packageExtension() {
  const manifest = readJSON("manifest.json");
  const pkg = readJSON("package.json");
  const lock = readJSON("package-lock.json");
  if (!/^[a-z0-9-]+$/.test(pkg.name) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("Expected a plain package name and a three-part numeric version.");
  }
  if ([pkg.version, lock.version, lock.packages[""].version].some(version => version !== manifest.version)) {
    throw new Error("Manifest, package, and lockfile versions must match before packaging.");
  }

  // Manifest entry points plus the popup's script and the distribution notices.
  // An allowlist keeps new development files out of releases automatically.
  const files = [...new Set([
    "manifest.json", "popup.js", "LICENSE", "PRIVACY_POLICY.md", "TERMS_OF_SERVICE.md",
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])])
  ])].sort();

  for (const file of files) {
    const relative = path.relative(root, path.resolve(root, file));
    if (path.isAbsolute(file) || path.isAbsolute(relative) || relative.startsWith(`..${path.sep}`) || relative === "..") {
      throw new Error(`Release file must be inside the repository: ${file}`);
    }
    if (!fs.lstatSync(path.join(root, file)).isFile()) {
      throw new Error(`Release entry must be a regular file: ${file}`);
    }
  }

  const tempParent = fs.realpathSync(os.tmpdir());
  const temp = fs.mkdtempSync(path.join(tempParent, "shut-up-youtube-package-"));
  try {
    const payload = path.join(temp, "extension");
    fs.mkdirSync(payload);
    for (const file of files) {
      const destination = path.join(payload, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, file), destination);
    }

    // Always archive a fresh directory so a previous ZIP cannot retain old files.
    const archive = path.join(temp, "extension.zip");
    if (process.platform === "win32") {
      const quote = value => "'" + value.replace(/'/g, "''") + "'";
      const entries = fs.readdirSync(payload).map(file => quote(path.join(payload, file)));
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `Compress-Archive -LiteralPath @(${entries.join(",")}) -DestinationPath ${quote(archive)} -CompressionLevel Optimal -ErrorAction Stop`
      ], { stdio: "inherit", windowsHide: true });
    } else {
      execFileSync("zip", ["-q", "-r", archive, "."], { cwd: payload, stdio: "inherit" });
    }

    const output = path.join(root, "dist", `${pkg.name}-${manifest.version}.zip`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(archive, output);
    console.log(`Created ${path.relative(root, output)} (${files.length} files, ${fs.statSync(output).size} bytes)`);
  } finally {
    // Only remove the temporary directory created by this invocation.
    const resolved = path.resolve(temp);
    if (path.dirname(resolved) !== tempParent || !path.basename(resolved).startsWith("shut-up-youtube-package-")) {
      throw new Error("Refusing to clean up an unexpected temporary directory.");
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

try {
  packageExtension();
} catch (error) {
  console.error(`Packaging failed: ${error.message}`);
  if (error.code === "ENOENT" && error.syscall?.startsWith("spawn")) {
    console.error("Packaging requires Windows PowerShell on Windows, or the zip command on macOS/Linux.");
  }
  process.exitCode = 1;
}

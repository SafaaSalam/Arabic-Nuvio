/**
 * Mirrors all workspace files from c:\Users\SSH\Desktop\Arabic_Nuvio
 * to C:\Users\SSH\Documents\GitHub\Arabic-Nuvio (preserving .git in the target directory).
 */

const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.resolve(__dirname, "..");
const TARGET_DIR = "C:\\Users\\SSH\\Documents\\GitHub\\Arabic-Nuvio";

const EXCLUDE_NAMES = new Set([".git", "node_modules", ".DS_Store"]);

function syncDirectory(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  let copiedCount = 0;

  for (const entry of entries) {
    if (EXCLUDE_NAMES.has(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copiedCount += syncDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      copiedCount++;
    }
  }

  return copiedCount;
}

function mirrorToGitHubRepo() {
  // Only run when on local Windows environment where the parent Documents\GitHub path exists
  const parentDir = path.dirname(TARGET_DIR);
  if (!fs.existsSync(parentDir)) {
    return 0;
  }

  if (path.resolve(SOURCE_DIR).toLowerCase() === path.resolve(TARGET_DIR).toLowerCase()) {
    return 0;
  }

  const count = syncDirectory(SOURCE_DIR, TARGET_DIR);
  console.log(`📂 Mirrored ${count} files to ${TARGET_DIR}`);
  return count;
}

if (require.main === module) {
  mirrorToGitHubRepo();
}

module.exports = { mirrorToGitHubRepo, TARGET_DIR };

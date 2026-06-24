const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

walk('src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Replace dark:bg-slate-800 or dark:bg-slate-700 with dark:bg-transparent for white cards
    content = content.replace(/bg-white\s+dark:bg-slate-\d+/g, 'bg-white dark:bg-transparent dark:border-white/10');
    // Ensure standalone bg-white also gets dark mode transparent
    content = content.replace(/className="([^"]*\bbg-white\b[^"]*)"/g, (match, p1) => {
      if (!p1.includes('dark:bg-')) {
        return `className="${p1} dark:bg-transparent dark:border-white/10"`;
      }
      return match;
    });

    // Font color to white in dark mode
    content = content.replace(/dark:text-slate-[1-4]00/g, 'dark:text-white');
    content = content.replace(/text-slate-\d+00(?!\s+dark:text-)/g, '$& dark:text-white');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});

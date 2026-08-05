const patchBlock = `
    # Xcode 16 consteval workaround for fmt
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      content = File.read(fmt_base)
      unless content.include?('Xcode 16 workaround')
        patched = content.gsub(
          /(#\\s*define\\s+FMT_USE_CONSTEVAL)\\s+1/,
          "\\\\1 0 // Xcode 16 workaround"
        )
        File.chmod(0644, fmt_base)
        File.write(fmt_base, patched)
      end
    end`;

console.log(patchBlock);

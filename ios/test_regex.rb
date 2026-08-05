content = <<EOF
#  define FMT_USE_CONSTEVAL 0
#  define FMT_USE_CONSTEVAL 1
#  define FMT_USE_CONSTEVAL 1
EOF

patched = content.gsub(
  /(#\s*define\s+FMT_USE_CONSTEVAL)\s+1/,
  "\\1 0 // Xcode 16 workaround"
)

puts patched

const fs = require('fs');
const zlib = require('zlib');

const buffer = fs.readFileSync('/Users/ruuuview/Desktop/build_log.txt');
console.log('File size:', buffer.length);
console.log('First 16 bytes:', buffer.slice(0, 16));

// Try gunzip
zlib.gunzip(buffer, (err, result) => {
  if (!err) {
    console.log('Successfully gunzipped!');
    fs.writeFileSync('/Users/ruuuview/Desktop/decompressed.txt', result);
    return;
  }
  console.log('Gunzip failed:', err.message);

  // Try inflate (raw deflate)
  zlib.inflateRaw(buffer, (err2, result2) => {
    if (!err2) {
      console.log('Successfully inflated raw!');
      fs.writeFileSync('/Users/ruuuview/Desktop/decompressed.txt', result2);
      return;
    }
    console.log('InflateRaw failed:', err2.message);

    // Try standard inflate
    zlib.inflate(buffer, (err3, result3) => {
      if (!err3) {
        console.log('Successfully inflated standard!');
        fs.writeFileSync('/Users/ruuuview/Desktop/decompressed.txt', result3);
        return;
      }
      console.log('Inflate standard failed:', err3.message);

      // Try brotli decompress
      zlib.brotliDecompress(buffer, (err4, result4) => {
        if (!err4) {
          console.log('Successfully brotli decompressed!');
          fs.writeFileSync('/Users/ruuuview/Desktop/decompressed.txt', result4);
          return;
        }
        console.log('Brotli decompress failed:', err4.message);
      });
    });
  });
});

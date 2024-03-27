const sharp = require('sharp');
const fs = require('fs');

sharp('nouser.webp')
  .raw()
  .png()
  .resize({
    width: 512,
    height: 512,
    fit: 'cover'
  })
  .toBuffer().then((buffer) => {
    fs.writeFile("img.txt", `data:image/png;base64,${buffer.toString('base64')}`, (err) => {
      if (err) {
        console.error('Error writing to file:', err);
        return;
      }
      console.log('Text has been written to file successfully.');
    });
  });
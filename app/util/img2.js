async function fetchAndConvertToBase64(url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const base64data = arrayBufferToBase64(arrayBuffer);
      return base64data;
    } catch (error) {
      console.error('Error fetching and converting to Base64:', error);
      throw error;
    }
  }
  
  function arrayBufferToBase64(arrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  // Example usage:
  const imageUrl = 'https://ui-avatars.com/api/?background=96e396&color=0a0a0a&name=asher.aaa';
  fetchAndConvertToBase64(imageUrl)
    .then(base64data => {
      console.log('Base64 representation:', base64data);
      // You can use the base64 data here as needed
    })
    .catch(error => {
      console.error('Error:', error);
    });


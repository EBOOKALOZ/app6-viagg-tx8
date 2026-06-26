// Test coordinate parsing for DMS format
const text = '10°34\'49.1"S 59°23\'05.5"W';

// Simulate the normalization from coordinateParser.ts
const normalized = text
  .toUpperCase()
  .replace(/[°º'"´`′″]/g, ' ')
  .replace(/[,;/]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

console.log('Input:', text);
console.log('Normalized:', JSON.stringify(normalized));

// DMS pattern from coordinateParser.ts line 49
const dmsPattern = /(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s*([NSEW]|[O])\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s*([NSEW]|[O])/i;
const dmsMatch = normalized.match(dmsPattern);

console.log('DMS Match:', dmsMatch ? 'YES' : 'NO');
if (dmsMatch) {
  console.log('Groups:', dmsMatch.slice(1));
  
  const latDeg = parseFloat(dmsMatch[1]);
  const latMin = parseFloat(dmsMatch[2]);
  const latSec = parseFloat(dmsMatch[3]);
  const latDir = dmsMatch[4];
  
  const lngDeg = parseFloat(dmsMatch[5]);
  const lngMin = parseFloat(dmsMatch[6]);
  const lngSec = parseFloat(dmsMatch[7]);
  const lngDir = dmsMatch[8];
  
  let lat = Math.abs(latDeg) + (latMin / 60) + (latSec / 3600);
  if (latDir === 'S' || latDir === 'W' || latDir === 'O') lat = -lat;
  
  let lng = Math.abs(lngDeg) + (lngMin / 60) + (lngSec / 3600);
  if (lngDir === 'S' || lngDir === 'W' || lngDir === 'O') lng = -lng;
  
  console.log('Latitude:', lat);
  console.log('Longitude:', lng);
  console.log('Expected: ~-10.5803 ~-59.3849');
} else {
  console.log('FAILED: DMS pattern did not match');
  
  // Try to debug: what does the normalized text look like character by character?
  console.log('Chars:', [...normalized].map(c => c + '(' + c.charCodeAt(0) + ')').join(' '));
}

const text = "10°34'49.1\"S 59°23'05.5\"W";
const n = text.toUpperCase().replace(/[°º'"´`′″]/g, ' ').replace(/[,;/]+/g, ' ').replace(/\s+/g, ' ').trim();
console.log('Normalized:', n);
const p = /(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s*([NSEW]|[O])\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s*([NSEW]|[O])/i;
console.log(n.match(p));
const p2 = /(-?\d+\.?\d*)[,\s/]+(-?\d+\.?\d*)/;
console.log(n.match(p2));

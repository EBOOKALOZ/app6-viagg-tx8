const fs = require('fs');
let txt = fs.readFileSync('src/pages/admin/AdminVehicleOverview.tsx', 'utf8');
const t2 = txt.split('\n');

let start = t2.findIndex(line => line.includes('const { data: allPkgs, isLoading: loadingPkgs } = useAdminRealEstatePackages();'));
let end = t2.findIndex(line => line.includes('// Buscar pacotes da categoria') && line.includes('vehicles'));

if (start > -1 && end > -1) {
    t2.splice(start, end - start - 1);
    fs.writeFileSync('src/pages/admin/AdminVehicleOverview.tsx', t2.join('\n'));
    console.log('Fixed block');
} else {
    console.log('Not found:', start, end);
}

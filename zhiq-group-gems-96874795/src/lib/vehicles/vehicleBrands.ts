/**
 * Lista de montadoras (marcas) de veículos — nacionais e estrangeiras.
 * Usada no dropdown de Marca do formulário de veículo (VehicleForm).
 * O Modelo é digitado livremente pelo anunciante.
 */
export const VEHICLE_BRANDS: string[] = [
  // Carros — alta presença no Brasil
  "Volkswagen",
  "Chevrolet",
  "Fiat",
  "Ford",
  "Renault",
  "Toyota",
  "Honda",
  "Hyundai",
  "Nissan",
  "Jeep",
  "Peugeot",
  "Citroën",
  "Mitsubishi",
  "Kia",
  "Caoa Chery",
  "BYD",
  "GWM",
  "Suzuki",
  "Subaru",
  // Premium / importadas
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Volvo",
  "Land Rover",
  "Jaguar",
  "Porsche",
  "Mini",
  "Lexus",
  "Ram",
  "Dodge",
  "Chrysler",
  // Motos
  "Yamaha",
  "Honda Motos",
  "Suzuki Motos",
  "Kawasaki",
  "Harley-Davidson",
  "Triumph",
  "Royal Enfield",
  "Dafra",
  "Shineray",
  "Haojue",
  // Caminhões / utilitários / ônibus
  "Scania",
  "Iveco",
  "Volkswagen Caminhões",
  "Mercedes-Benz Caminhões",
  "DAF",
  "Agrale",
  "JAC",
  // Fallback
  "Outra",
];

/**
 * Montadoras de MOTOS (nacionais e estrangeiras) — usadas quando o tipo do
 * veículo é "moto". 30+ marcas + "Outra".
 */
export const MOTO_BRANDS: string[] = [
  "Honda",
  "Yamaha",
  "Suzuki",
  "Kawasaki",
  "BMW Motorrad",
  "Harley-Davidson",
  "Triumph",
  "Ducati",
  "KTM",
  "Royal Enfield",
  "Dafra",
  "Haojue",
  "Shineray",
  "Traxx",
  "Kymco",
  "Bull Motors",
  "Avelloz",
  "Voltz",
  "MV Agusta",
  "Aprilia",
  "Husqvarna",
  "Indian",
  "Vespa",
  "Piaggio",
  "Benelli",
  "CFMOTO",
  "Zontes",
  "Lifan",
  "Sousa Motos",
  "Brava",
  "Outra",
];

/**
 * Estaleiros / fábricas de BARCOS e lanchas (nacionais e importadas) — usadas
 * quando o tipo do veículo é "barco". 30+ marcas + "Outra".
 */
export const BOAT_BRANDS: string[] = [
  // Nacionais
  "Schaefer Yachts",
  "Intermarine",
  "Cimitarra",
  "Fibrafort",
  "Focker",
  "Real Powerboats",
  "Triton Yachts",
  "Phantom",
  "Coral",
  "Ventura",
  "NX Boats",
  "Armada",
  "FS Yachts",
  "Carbon Yachts",
  "Runner Boats",
  "Levefort",
  "Martinelli",
  "Marajó",
  "Bel Marine",
  "Solara",
  "Tecnoboats",
  "Magna",
  // Importadas
  "Azimut",
  "Ferretti",
  "Princess",
  "Sunseeker",
  "Jeanneau",
  "Beneteau",
  "Sea Ray",
  "Bayliner",
  "Outra",
];

export default VEHICLE_BRANDS;

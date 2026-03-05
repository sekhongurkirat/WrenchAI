export type VehicleMake = { make: string; models: string[] };

export const VEHICLES: VehicleMake[] = [
  { make: "Acura", models: ["ILX", "MDX", "RDX", "TLX", "NSX"] },
  { make: "Audi", models: ["A3", "A4", "A5", "A6", "Q3", "Q5", "Q7", "Q8", "e-tron"] },
  { make: "BMW", models: ["2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X7", "i4", "iX"] },
  { make: "Buick", models: ["Enclave", "Encore", "Encore GX", "Envision"] },
  { make: "Cadillac", models: ["CT4", "CT5", "Escalade", "XT4", "XT5", "XT6"] },
  { make: "Chevrolet", models: ["Blazer", "Colorado", "Corvette", "Equinox", "Malibu", "Silverado 1500", "Silverado 2500HD", "Suburban", "Tahoe", "Trailblazer", "Traverse"] },
  { make: "Chrysler", models: ["300", "Pacifica", "Voyager"] },
  { make: "Dodge", models: ["Challenger", "Charger", "Durango", "Hornet"] },
  { make: "Ford", models: ["Bronco", "Bronco Sport", "Edge", "Escape", "Explorer", "F-150", "F-250 Super Duty", "Maverick", "Mustang", "Mustang Mach-E", "Ranger", "Transit"] },
  { make: "GMC", models: ["Acadia", "Canyon", "Sierra 1500", "Sierra 2500HD", "Terrain", "Yukon"] },
  { make: "Honda", models: ["Accord", "Civic", "CR-V", "HR-V", "Odyssey", "Passport", "Pilot", "Ridgeline"] },
  { make: "Hyundai", models: ["Elantra", "Ioniq 5", "Ioniq 6", "Kona", "Palisade", "Santa Cruz", "Santa Fe", "Sonata", "Tucson"] },
  { make: "Infiniti", models: ["Q50", "Q60", "QX50", "QX60", "QX80"] },
  { make: "Jeep", models: ["Cherokee", "Compass", "Gladiator", "Grand Cherokee", "Renegade", "Wrangler"] },
  { make: "Kia", models: ["Carnival", "EV6", "Forte", "K5", "Niro", "Seltos", "Sorento", "Soul", "Sportage", "Telluride"] },
  { make: "Lexus", models: ["ES", "GX", "IS", "LS", "LX", "NX", "RX", "UX"] },
  { make: "Lincoln", models: ["Aviator", "Corsair", "Nautilus", "Navigator"] },
  { make: "Mazda", models: ["CX-5", "CX-50", "CX-9", "Mazda3", "Mazda6", "MX-5 Miata"] },
  { make: "Mercedes-Benz", models: ["A-Class", "C-Class", "E-Class", "GLA", "GLC", "GLE", "GLB", "S-Class", "Sprinter"] },
  { make: "Nissan", models: ["Altima", "Armada", "Frontier", "Kicks", "Leaf", "Maxima", "Murano", "Pathfinder", "Rogue", "Sentra", "Titan", "Versa"] },
  { make: "Porsche", models: ["911", "Cayenne", "Macan", "Panamera", "Taycan"] },
  { make: "Ram", models: ["1500", "2500", "3500", "ProMaster"] },
  { make: "Subaru", models: ["Ascent", "BRZ", "Crosstrek", "Forester", "Impreza", "Legacy", "Outback", "WRX"] },
  { make: "Tesla", models: ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"] },
  { make: "Toyota", models: ["4Runner", "Avalon", "Camry", "Corolla", "GR86", "Highlander", "Land Cruiser", "Prius", "RAV4", "Sequoia", "Sienna", "Supra", "Tacoma", "Tundra", "Venza"] },
  { make: "Volkswagen", models: ["Atlas", "Golf", "GTI", "ID.4", "Jetta", "Passat", "Taos", "Tiguan"] },
  { make: "Volvo", models: ["S60", "S90", "V60", "V90", "XC40", "XC60", "XC90"] },
];

export const MAKES = VEHICLES.map((v) => v.make);

export function getModels(make: string): string[] {
  return VEHICLES.find((v) => v.make === make)?.models ?? [];
}

export const REPAIR_TYPES = [
  { id: "oil-change", label: "Oil Change", icon: "🛢️" },
  { id: "air-filter", label: "Air Filter", icon: "💨" },
  { id: "cabin-filter", label: "Cabin Filter", icon: "🌿" },
  { id: "wipers", label: "Wipers", icon: "🌧️" },
  { id: "battery", label: "Battery", icon: "🔋" },
  { id: "fluids", label: "Check Fluids", icon: "💧" },
  { id: "tire-pressure", label: "Tire Pressure", icon: "🔵" },
  { id: "check-engine", label: "Check Engine Light", icon: "⚠️" },
];

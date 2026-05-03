/**
 * ISO alpha-2 country code → Natural Earth full name (as used by world-atlas).
 *
 * MaxMind GeoIP2 stores isoCode ("DE"); world-atlas TopoJSON uses English
 * full names ("Germany").  Both the WorldMap choropleth and the Top-Countries
 * list consume this table so it lives here as a single source of truth.
 */
export const ISO_TO_COUNTRY_NAME: Record<string, string> = {
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AO: 'Angola', AR: 'Argentina',
  AM: 'Armenia', AU: 'Australia', AT: 'Austria', AZ: 'Azerbaijan', BS: 'Bahamas',
  BH: 'Bahrain', BD: 'Bangladesh', BY: 'Belarus', BE: 'Belgium', BZ: 'Belize',
  BJ: 'Benin', BT: 'Bhutan', BO: 'Bolivia', BA: 'Bosnia and Herz.', BW: 'Botswana',
  BR: 'Brazil', BN: 'Brunei', BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi',
  KH: 'Cambodia', CM: 'Cameroon', CA: 'Canada', CF: 'Central African Rep.',
  TD: 'Chad', CL: 'Chile', CN: 'China', CO: 'Colombia', CG: 'Congo',
  CD: 'Dem. Rep. Congo', CR: 'Costa Rica', HR: 'Croatia', CU: 'Cuba', CY: 'Cyprus',
  CZ: 'Czechia', DK: 'Denmark', DJ: 'Djibouti', DO: 'Dominican Rep.',
  EC: 'Ecuador', EG: 'Egypt', SV: 'El Salvador', GQ: 'Eq. Guinea', ER: 'Eritrea',
  EE: 'Estonia', SZ: 'eSwatini', ET: 'Ethiopia', FJ: 'Fiji', FI: 'Finland',
  FR: 'France', GA: 'Gabon', GM: 'Gambia', GE: 'Georgia', DE: 'Germany',
  GH: 'Ghana', GR: 'Greece', GT: 'Guatemala', GN: 'Guinea', GW: 'Guinea-Bissau',
  GY: 'Guyana', HT: 'Haiti', HN: 'Honduras', HU: 'Hungary', IN: 'India',
  ID: 'Indonesia', IR: 'Iran', IQ: 'Iraq', IE: 'Ireland', IL: 'Israel',
  IT: 'Italy', CI: 'Ivory Coast', JM: 'Jamaica', JP: 'Japan', JO: 'Jordan',
  KZ: 'Kazakhstan', KE: 'Kenya', KP: 'North Korea', KR: 'South Korea',
  KW: 'Kuwait', KG: 'Kyrgyzstan', LA: 'Laos', LV: 'Latvia', LB: 'Lebanon',
  LS: 'Lesotho', LR: 'Liberia', LY: 'Libya', LT: 'Lithuania', LU: 'Luxembourg',
  MK: 'Macedonia', MG: 'Madagascar', MW: 'Malawi', MY: 'Malaysia', ML: 'Mali',
  MR: 'Mauritania', MX: 'Mexico', MD: 'Moldova', MN: 'Mongolia', MA: 'Morocco',
  MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibia', NP: 'Nepal', NL: 'Netherlands',
  NZ: 'New Zealand', NI: 'Nicaragua', NE: 'Niger', NG: 'Nigeria', NO: 'Norway',
  OM: 'Oman', PK: 'Pakistan', PA: 'Panama', PG: 'Papua New Guinea', PY: 'Paraguay',
  PE: 'Peru', PH: 'Philippines', PL: 'Poland', PT: 'Portugal', QA: 'Qatar',
  RO: 'Romania', RU: 'Russia', RW: 'Rwanda', SA: 'Saudi Arabia', SN: 'Senegal',
  RS: 'Serbia', SL: 'Sierra Leone', SK: 'Slovakia', SI: 'Slovenia',
  SO: 'Somalia', ZA: 'South Africa', SS: 'S. Sudan', ES: 'Spain', LK: 'Sri Lanka',
  SD: 'Sudan', SR: 'Suriname', SE: 'Sweden', CH: 'Switzerland', SY: 'Syria',
  TW: 'Taiwan', TJ: 'Tajikistan', TZ: 'Tanzania', TH: 'Thailand',
  TL: 'Timor-Leste', TG: 'Togo', TT: 'Trinidad and Tobago', TN: 'Tunisia',
  TR: 'Turkey', TM: 'Turkmenistan', UG: 'Uganda', UA: 'Ukraine',
  AE: 'United Arab Emirates', GB: 'United Kingdom', US: 'United States of America',
  UY: 'Uruguay', UZ: 'Uzbekistan', VE: 'Venezuela', VN: 'Vietnam',
  YE: 'Yemen', ZM: 'Zambia', ZW: 'Zimbabwe',
}

/** Resolve an ISO alpha-2 code to its full English name, falling back to the code itself. */
export function countryName(code: string | null | undefined): string {
  if (!code) return 'Unknown'
  return ISO_TO_COUNTRY_NAME[code] ?? code
}

/** Convert an ISO alpha-2 code to a flag emoji (e.g. "DE" → "🇩🇪"). */
export function countryFlag(code: string | null | undefined): string | undefined {
  if (!code || code.length !== 2) return undefined
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65),
  )
}

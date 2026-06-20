// Bikram Sambat (BS) <-> Gregorian (AD) calendar converter
// Covers BS years 2000–2089 (AD ~1943–2032)
// Source: Standard NP govt published BS month-day tables

const BS_MONTH_DAYS: Record<number, number[]> = {
  2000: [30,32,31,32,31,30,30,30,29,30,29,31],
  2001: [31,31,32,31,31,31,30,29,30,29,30,30],
  2002: [31,31,32,32,31,30,30,29,30,29,30,30],
  2003: [31,32,31,32,31,30,30,30,29,29,30,31],
  2004: [30,32,31,32,31,30,30,30,29,30,29,31],
  2005: [31,31,32,31,31,31,30,29,30,29,30,30],
  2006: [31,31,32,32,31,30,30,29,30,29,30,30],
  2007: [31,32,31,32,31,30,30,30,29,29,30,31],
  2008: [31,31,32,31,31,31,30,30,29,29,30,30],
  2009: [31,31,32,32,31,30,30,29,30,29,30,30],
  2010: [31,32,31,32,31,30,30,30,29,29,30,31],
  2011: [30,32,31,32,31,30,30,30,29,30,29,31],
  2012: [31,31,32,31,31,31,30,29,30,29,30,30],
  2013: [31,31,32,32,31,30,30,29,30,29,30,30],
  2014: [31,32,31,32,31,30,30,30,29,29,30,31],
  2015: [31,31,32,31,31,31,30,30,29,29,30,30],
  2016: [31,31,32,32,31,30,30,29,30,29,30,30],
  2017: [31,32,31,32,31,30,30,30,29,29,30,31],
  2018: [31,31,32,31,31,31,30,29,30,29,30,30],
  2019: [31,31,32,32,31,30,30,29,30,29,30,30],
  2020: [31,32,31,32,31,30,30,30,29,30,29,31],
  2021: [30,32,31,32,31,30,30,30,29,30,29,31],
  2022: [31,31,32,31,31,30,30,29,30,29,30,30],
  2023: [31,31,32,32,31,30,30,29,30,29,30,30],
  2024: [31,32,31,32,31,30,30,30,29,29,30,31],
  2025: [31,31,32,31,31,31,30,29,30,29,30,30],
  2026: [31,31,32,32,31,30,30,29,30,29,30,31],
  2027: [30,32,31,32,31,30,30,30,29,30,29,31],
  2028: [31,31,32,31,31,30,30,30,29,30,29,31],
  2029: [31,31,32,31,31,31,30,29,30,29,30,30],
  2030: [31,31,32,32,31,30,30,29,30,29,30,30],
  2031: [31,32,31,32,31,30,30,30,29,29,30,31],
  2032: [31,31,32,31,31,31,30,29,30,29,30,30],
  2033: [31,31,32,32,31,30,30,29,30,29,30,30],
  2034: [31,32,31,32,31,30,30,30,29,29,30,31],
  2035: [30,32,31,32,31,30,30,30,29,30,29,31],
  2036: [31,31,32,31,31,30,30,30,29,30,29,31],
  2037: [31,31,32,32,31,30,30,29,30,29,30,30],
  2038: [31,32,31,32,31,30,30,30,29,29,30,31],
  2039: [31,31,32,31,31,31,30,29,30,29,30,30],
  2040: [31,31,32,32,31,30,30,29,30,29,30,30],
  2041: [31,32,31,32,31,30,30,30,29,30,29,31],
  2042: [30,32,31,32,31,30,30,30,29,30,29,31],
  2043: [31,31,32,31,31,30,30,30,29,30,29,31],
  2044: [31,31,32,32,31,30,30,29,30,29,30,30],
  2045: [31,32,31,32,31,30,30,30,29,29,30,31],
  2046: [31,31,32,31,31,31,30,29,30,29,30,30],
  2047: [31,31,32,32,31,30,30,29,30,29,30,31],
  2048: [30,32,31,32,31,30,30,30,29,30,29,31],
  2049: [31,31,32,31,31,30,30,30,29,30,29,31],
  2050: [31,31,32,32,31,30,30,29,30,29,30,30],
  2051: [31,32,31,32,31,30,30,30,29,29,30,31],
  2052: [31,31,32,31,31,31,30,29,30,29,30,30],
  2053: [31,31,32,32,31,30,30,29,30,29,30,30],
  2054: [31,32,31,32,31,30,30,30,29,29,30,31],
  2055: [30,32,31,32,31,30,30,30,29,30,29,31],
  2056: [31,31,32,31,31,30,30,30,29,30,29,31],
  2057: [31,31,32,32,31,30,30,29,30,29,30,30],
  2058: [31,32,31,32,31,30,30,30,29,29,30,31],
  2059: [31,31,32,31,31,31,30,29,30,29,30,30],
  2060: [31,31,32,32,31,30,30,29,30,29,30,30],
  2061: [31,32,31,32,31,30,30,30,29,30,29,31],
  2062: [30,32,31,32,31,30,30,30,29,30,29,31],
  2063: [31,31,32,31,31,30,30,30,29,30,29,31],
  2064: [31,31,32,32,31,30,30,29,30,29,30,30],
  2065: [31,32,31,32,31,30,30,30,29,29,30,31],
  2066: [31,31,32,31,31,31,30,29,30,29,30,30],
  2067: [31,31,32,32,31,30,30,29,30,29,30,31],
  2068: [30,32,31,32,31,30,30,30,29,30,29,31],
  2069: [31,31,32,31,31,30,30,30,29,30,29,31],
  2070: [31,31,32,32,31,30,30,29,30,29,30,30],
  2071: [31,32,31,32,31,30,30,30,29,29,30,31],
  2072: [31,31,32,31,31,31,30,29,30,29,30,30],
  2073: [31,31,32,32,31,30,30,29,30,29,30,30],
  2074: [31,32,31,32,31,30,30,30,29,29,30,31],
  2075: [30,32,31,32,31,30,30,30,29,30,29,31],
  2076: [31,31,32,31,31,30,30,30,29,30,29,31],
  2077: [31,31,32,32,31,30,30,29,30,29,30,30],
  2078: [31,32,31,32,31,30,30,30,29,29,30,31],
  2079: [31,31,32,31,31,31,30,29,30,29,30,30],
  2080: [31,31,32,32,31,30,30,29,30,29,30,30],
  2081: [31,32,31,32,31,30,30,30,29,30,29,31],
  2082: [30,32,31,32,31,30,30,30,29,30,29,31],
  2083: [31,31,32,31,31,30,30,30,29,30,29,31],
  2084: [31,31,32,32,31,30,30,29,30,29,30,30],
  2085: [31,32,31,32,31,30,30,30,29,29,30,31],
  2086: [31,31,32,31,31,31,30,29,30,29,30,30],
  2087: [30,32,31,32,31,30,30,29,30,29,30,30],
  2088: [31,32,31,32,31,30,30,30,29,30,29,31],
  2089: [30,32,31,32,31,30,30,30,29,30,29,31],
};

// BS year 2000 starts on AD 1943-04-14
const BS_EPOCH_AD_YEAR = 1943;
const BS_EPOCH_AD_MONTH = 4;
const BS_EPOCH_AD_DAY = 14;
const BS_EPOCH_YEAR = 2000;

function totalBsDaysFrom2000(bsYear: number, bsMonth: number, bsDay: number): number {
  let total = 0;
  for (let y = BS_EPOCH_YEAR; y < bsYear; y++) {
    const days = BS_MONTH_DAYS[y];
    if (!days) break;
    for (let m = 0; m < 12; m++) total += days[m];
  }
  const monthDays = BS_MONTH_DAYS[bsYear];
  if (!monthDays) return total;
  for (let m = 0; m < bsMonth - 1; m++) total += monthDays[m];
  total += bsDay - 1;
  return total;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function adDaysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

function adDateToEpochDays(year: number, month: number, day: number): number {
  let days = 0;
  for (let y = 1; y < year; y++) {
    days += isLeapYear(y) ? 366 : 365;
  }
  for (let m = 1; m < month; m++) {
    days += adDaysInMonth(year, m);
  }
  days += day;
  return days;
}

const BS_EPOCH_AD_DAYS = adDateToEpochDays(BS_EPOCH_AD_YEAR, BS_EPOCH_AD_MONTH, BS_EPOCH_AD_DAY);

export interface BsDate { year: number; month: number; day: number; }

export function adToBs(adYear: number, adMonth: number, adDay: number): BsDate {
  const adDays = adDateToEpochDays(adYear, adMonth, adDay);
  let bsDiff = adDays - BS_EPOCH_AD_DAYS;

  let bsYear = BS_EPOCH_YEAR;
  let bsMonth = 1;
  let bsDay = 1;

  while (bsDiff > 0) {
    const monthDays = BS_MONTH_DAYS[bsYear];
    if (!monthDays) break;
    const daysInMonth = monthDays[bsMonth - 1];
    if (bsDiff < daysInMonth) {
      bsDay += bsDiff;
      bsDiff = 0;
    } else {
      bsDiff -= daysInMonth;
      bsMonth++;
      if (bsMonth > 12) { bsMonth = 1; bsYear++; }
    }
  }

  return { year: bsYear, month: bsMonth, day: bsDay };
}

export function bsToAd(bsYear: number, bsMonth: number, bsDay: number): { year: number; month: number; day: number } {
  const bsDiff = totalBsDaysFrom2000(bsYear, bsMonth, bsDay);
  let adDays = BS_EPOCH_AD_DAYS + bsDiff;

  let adYear = 1;
  while (true) {
    const yearDays = isLeapYear(adYear) ? 366 : 365;
    if (adDays <= yearDays) break;
    adDays -= yearDays;
    adYear++;
  }
  let adMonth = 1;
  while (true) {
    const mDays = adDaysInMonth(adYear, adMonth);
    if (adDays <= mDays) break;
    adDays -= mDays;
    adMonth++;
  }
  return { year: adYear, month: adMonth, day: adDays };
}

export function adDateToBs(isoDate: string): BsDate {
  const [y, m, d] = isoDate.split("-").map(Number);
  return adToBs(y, m, d);
}

export function bsDateToAd(bsYear: number, bsMonth: number, bsDay: number): string {
  const { year, month, day } = bsToAd(bsYear, bsMonth, bsDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayBs(): BsDate {
  const now = new Date();
  return adToBs(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function todayAdIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const BS_MONTH_NAMES_EN = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan",
  "Bhadra", "Ashwin", "Kartik", "Mangsir",
  "Poush", "Magh", "Falgun", "Chaitra",
];

export const BS_MONTH_NAMES_NE = [
  "बैशाख", "जेठ", "असार", "श्रावण",
  "भदौ", "आश्विन", "कार्तिक", "मङ्सिर",
  "पुष", "माघ", "फाल्गुन", "चैत",
];

export const AD_MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

export function getDaysInBsMonth(bsYear: number, bsMonth: number): number {
  return BS_MONTH_DAYS[bsYear]?.[bsMonth - 1] ?? 30;
}

export function getFirstWeekdayOfBsMonth(bsYear: number, bsMonth: number): number {
  const { year, month, day } = bsToAd(bsYear, bsMonth, 1);
  return new Date(year, month - 1, day).getDay();
}

export function formatBsDate(bs: BsDate): string {
  return `${bs.year}-${String(bs.month).padStart(2, "0")}-${String(bs.day).padStart(2, "0")}`;
}

export function bsIsoToDisplay(bsYear: number, bsMonth: number, bsDay: number): string {
  return `${bsDay} ${BS_MONTH_NAMES_EN[bsMonth - 1]} ${bsYear} BS`;
}

// Bikram Sambat (BS) <-> Gregorian (AD) calendar converter
// Powered by nepali-date-converter — same authoritative data tables used by Hamro Patra
// Covers BS years 2000–2100

import NepaliDate from "nepali-date-converter";

export interface BsDate { year: number; month: number; day: number; }

export function adToBs(adYear: number, adMonth: number, adDay: number): BsDate {
  const nd = new NepaliDate(new Date(adYear, adMonth - 1, adDay));
  return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
}

export function bsToAd(bsYear: number, bsMonth: number, bsDay: number): { year: number; month: number; day: number } {
  const nd = new NepaliDate(bsYear, bsMonth - 1, bsDay);
  const ad = nd.toJsDate();
  return { year: ad.getFullYear(), month: ad.getMonth() + 1, day: ad.getDate() };
}

export function adDateToBs(isoDate: string): BsDate {
  const [y, m, d] = isoDate.split("-").map(Number);
  return adToBs(y!, m!, d!);
}

export function bsDateToAd(bsYear: number, bsMonth: number, bsDay: number): string {
  const { year, month, day } = bsToAd(bsYear, bsMonth, bsDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayBs(): BsDate {
  const nd = new NepaliDate();
  return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
}

export function todayAdIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function getDaysInBsMonth(bsYear: number, bsMonth: number): number {
  const startAd = new NepaliDate(bsYear, bsMonth - 1, 1).toJsDate();
  let nextYear = bsYear;
  let nextMonth = bsMonth;
  if (nextMonth === 12) { nextYear++; nextMonth = 1; } else { nextMonth++; }
  const endAd = new NepaliDate(nextYear, nextMonth - 1, 1).toJsDate();
  return Math.round((endAd.getTime() - startAd.getTime()) / (1000 * 60 * 60 * 24));
}

export function getFirstWeekdayOfBsMonth(bsYear: number, bsMonth: number): number {
  return new NepaliDate(bsYear, bsMonth - 1, 1).toJsDate().getDay();
}

export function formatBsDate(bs: BsDate): string {
  return `${bs.year}-${String(bs.month).padStart(2, "0")}-${String(bs.day).padStart(2, "0")}`;
}

export function bsIsoToDisplay(bsYear: number, bsMonth: number, bsDay: number): string {
  return `${bsDay} ${BS_MONTH_NAMES_EN[bsMonth - 1]} ${bsYear} BS`;
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

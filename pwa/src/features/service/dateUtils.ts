function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}${month}${day}`;
}

export function toYYYYMMDDWithHyphen(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

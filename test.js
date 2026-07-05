const exifTime = 1672574400000; // 2023-01-01 12:00:00 UTC
const d = new Date(exifTime);
const localTime = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
console.log(localTime);

/// <reference types="vite/client" />

interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

interface Window {
  queryLocalFonts?: () => Promise<FontData[]>;
}

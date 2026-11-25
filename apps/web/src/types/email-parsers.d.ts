declare module "addressparser" {
  interface ParsedAddress {
    name: string;
    address?: string;
    group?: ParsedAddress[];
  }
  function addressparser(input: string): ParsedAddress[];
  export = addressparser;
}

declare module "libmime" {
  const libmime: {
    decodeWords(value: string): string;
    decodeFlowed(value: string, delSp?: boolean): string;
  };
  export = libmime;
}

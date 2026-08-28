declare module "qrcode-terminal" {
  export const generate: (
    text: string,
    options?: { small?: boolean },
    callback?: (qr: string) => void,
  ) => void;
}

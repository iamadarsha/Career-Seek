declare module 'pdf-parse' {
  interface PDFData {
    text: string;
    numpages: number;
    info: any;
    metadata: any;
    version: string;
  }
  function pdf(dataBuffer: Buffer, options?: any): Promise<PDFData>;
  export default pdf;
}

declare module 'playwright' {
  export interface Browser {
    close(): Promise<void>;
    newContext(options?: any): Promise<BrowserContext>;
  }
  export interface BrowserContext {
    close(): Promise<void>;
    newPage(): Promise<any>;
    addInitScript(script: any): Promise<void>;
  }
  export const chromium: {
    launch(options?: any): Promise<Browser>;
  };
  export interface Page {
    goto(url: string, options?: any): Promise<any>;
    content(): Promise<string>;
    close(): Promise<void>;
  }
}

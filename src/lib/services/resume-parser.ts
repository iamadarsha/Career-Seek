import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export async function parseResumeFile(filePath: string, mimeType: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } 
  
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
    ext === '.docx'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error('Unsupported file format. Please upload a PDF or DOCX file.');
}

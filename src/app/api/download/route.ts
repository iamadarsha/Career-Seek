import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return new NextResponse('Missing path parameter', { status: 400 });
  }

  // Ensure the file exists
  if (!fs.existsSync(filePath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  // Basic security check to ensure it's within our app data dir or just a generic check
  // since it's local-first we can be a bit more relaxed, but still good to check if it's a file
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return new NextResponse('Not a file', { status: 400 });
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    
    // Determine content type based on extension
    let contentType = 'application/octet-stream';
    if (filename.endsWith('.docx')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

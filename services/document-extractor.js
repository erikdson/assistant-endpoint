import XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

class DocumentExtractor {
  
  // Extract text from various document formats
  async extractText(file) {
    const { originalname, mimetype, buffer } = file;
    
    try {
      // Determine extraction method based on file type
      if (mimetype === 'text/plain' || originalname.endsWith('.txt')) {
        return this.extractText_TXT(buffer);
      }
      
      if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
          originalname.endsWith('.docx')) {
        return await this.extractText_DOCX(buffer);
      }
      
      if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          mimetype === 'application/vnd.ms-excel' ||
          originalname.endsWith('.xlsx') || 
          originalname.endsWith('.xls')) {
        return this.extractText_EXCEL(buffer);
      }
      
      if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
        return await this.extractText_PDF(buffer);
      }
      
      // For unsupported formats, return a helpful message
      return `[Unable to extract text from ${originalname} - unsupported format: ${mimetype}]`;
      
    } catch (error) {
      console.error(`[DocumentExtractor] Error extracting from ${originalname}:`, error);
      return `[Error extracting text from ${originalname}: ${error.message}]`;
    }
  }
  
  // Extract text from plain text files
  extractText_TXT(buffer) {
    return buffer.toString('utf-8');
  }
  
  // Extract text from Word documents
  async extractText_DOCX(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  
  // Extract text from Excel files
  extractText_EXCEL(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    
    // Process each worksheet
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const sheetText = XLSX.utils.sheet_to_txt(worksheet, { header: 1 });
      
      if (sheetText.trim()) {
        text += `\n=== Sheet: ${sheetName} ===\n`;
        text += sheetText;
        text += '\n';
      }
    });
    
    return text;
  }
  
  // Extract text from PDF files
  async extractText_PDF(buffer) {
    const data = await pdfParse(buffer);
    return data.text;
  }
  
  // Check if file type is supported
  isSupported(file) {
    const { originalname, mimetype } = file;
    
    const supportedTypes = [
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/pdf'
    ];
    
    const supportedExtensions = ['.txt', '.docx', '.xlsx', '.xls', '.pdf'];
    
    return supportedTypes.includes(mimetype) || 
           supportedExtensions.some(ext => originalname.toLowerCase().endsWith(ext));
  }
  
  // Check if file should use PDF direct processing (Responses API)
  // Note: Currently disabled - all files use text extraction for tool support
  isPDFFile(file) {
    return false; // Always use text extraction for tool support
  }
}

export default DocumentExtractor;
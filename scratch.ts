import * as fs from 'fs';
import * as pdf from 'pdf-parse';

async function main() {
  const buffer = fs.readFileSync('d:/PALETIK/PRUEBAS/ALBARAN MAESTRO.pdf');
  const parser = new (pdf as any).PDFParse({ data: buffer });
  const textResult = await parser.getText();
  for (const page of textResult.pages) {
    console.log(page.text);
  }
  await parser.destroy();
}

main().catch(console.error);

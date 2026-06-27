import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DistributionItem, PalletResult } from './types';
import { calculatePalletsForQuantity, formatQuantitySpain } from './pdfEngine';

export function exportDesgloseToExcel(distributionList: DistributionItem[], fullPalletSize: number, minPico: number) {
  const data: any[] = [];

  distributionList.forEach((item, index) => {
    const pallets = item.customPallets && item.customPallets.length > 0 
      ? item.customPallets 
      : calculatePalletsForQuantity(item.quantity, fullPalletSize, minPico);

    pallets.forEach((p) => {
      data.push({
        '# Partida': index + 1,
        'Versión / Título': item.version,
        'Destino': item.address,
        'Total Partida': item.quantity,
        'Nº Palet': `${p.palletIndex} de ${p.totalPallets}`,
        'Bultos': p.quantity,
        'Observaciones': p.isAdjusted ? 'Balanceado' : ''
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Desglose");
  XLSX.writeFile(wb, "Desglose_Paletizado.xlsx");
}

export function exportDesgloseToPdf(distributionList: DistributionItem[], fullPalletSize: number, minPico: number) {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text("Desglose de Paletizado", 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generado el: ${new Date().toLocaleDateString()}`, 14, 30);

  const tableData: any[] = [];
  
  distributionList.forEach((item, index) => {
    const pallets = item.customPallets && item.customPallets.length > 0 
      ? item.customPallets 
      : calculatePalletsForQuantity(item.quantity, fullPalletSize, minPico);

    pallets.forEach((p, pIdx) => {
      tableData.push([
        pIdx === 0 ? (index + 1).toString() : '',
        pIdx === 0 ? item.version : '',
        pIdx === 0 ? item.address : '',
        pIdx === 0 ? formatQuantitySpain(item.quantity) : '',
        `${p.palletIndex}/${p.totalPallets}`,
        formatQuantitySpain(p.quantity),
        p.isAdjusted ? 'Balanceado' : ''
      ]);
    });
  });

  autoTable(doc, {
    startY: 35,
    head: [['#', 'Versión', 'Destino', 'Total', 'Palet', 'Bultos', 'Obs.']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [225, 29, 72] }, // Rose 600
  });

  doc.save("Desglose_Paletizado.pdf");
}

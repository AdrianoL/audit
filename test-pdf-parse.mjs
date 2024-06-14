import fetch from 'node-fetch';
import pdf from 'pdf-parse';

async function extractTextFromPdf(pdfUrl) {
    try {
        console.log(`Iniciando extracción de texto para: ${pdfUrl}`);
        const response = await fetch(pdfUrl);
        const arrayBuffer = await response.arrayBuffer();
        const data = Buffer.from(arrayBuffer);

        const pdfData = await pdf(data);
        const text = pdfData.text;

        console.log(`Extracción de texto completa para: ${pdfUrl}`);
        console.log(`Texto extraído:\n${text}`);
    } catch (error) {
        console.error('Error al extraer texto del PDF:', error);
    }
}

const pdfUrl = 'https://www.santafe.gov.ar/gestionesdecompras/descargar.php?m=anexo&id=119928&hash=2ea92cbd63f18091e5b5678142d64177';
extractTextFromPdf(pdfUrl);

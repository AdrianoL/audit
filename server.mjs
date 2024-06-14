import { google } from 'googleapis';
import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import pdf from 'pdf-parse';
import Tesseract from 'tesseract.js';

const app = express();
const port = 3000;

const credentials = JSON.parse(fs.readFileSync('credentials.json'));

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

const spreadsheetId = '1dHMn0MkBdrj1foq9QkuT8CsiExtjmj1-FMdmXNpYWrE';

app.use(bodyParser.json({ limit: '50mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/sheets/:sheetName/:colName', async (req, res) => {
    const sheetName = req.params.sheetName;
    const colName = req.params.colName;

    try {
        const authClient = await auth.getClient();
        const response = await sheets.spreadsheets.values.get({
            auth: authClient,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A:Z`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            res.status(404).send('No data found in the sheet');
            return;
        }

        const headers = rows[0];
        const colIndex = headers.indexOf(colName);
        if (colIndex === -1) {
            res.status(404).send('Column not found');
            return;
        }

        const colData = rows.slice(1).map(row => row[colIndex]);

        res.json(colData);
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        res.status(500).send('Error fetching sheet data');
    }
});

app.get('/sheets', async (req, res) => {
    try {
        const authClient = await auth.getClient();
        const sheetList = await sheets.spreadsheets.get({
            auth: authClient,
            spreadsheetId: spreadsheetId,
        });

        const sheetsInfo = sheetList.data.sheets.map(sheet => ({
            title: sheet.properties.title,
            sheetId: sheet.properties.sheetId,
        }));

        res.json(sheetsInfo);
    } catch (error) {
        console.error('Error fetching sheet list:', error);
        res.status(500).send('Error fetching sheet list');
    }
});

app.get('/data/:sheetName', async (req, res) => {
    const sheetName = req.params.sheetName;
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: sheetName
        });

        const rows = response.data.values;
        if (rows && rows.length) {
            const headers = rows[0];
            const data = rows.slice(1).map(row => {
                let rowData = {};
                headers.forEach((header, index) => {
                    rowData[header] = row[index] || '';
                });
                return rowData;
            });
            res.status(200).json({ headers, data });
        } else {
            res.status(200).json({ headers: [], data: [] });
        }
    } catch (error) {
        console.error('Error obteniendo datos de Google Sheets:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/import', async (req, res) => {
    const { data, sheetName } = req.body;

    console.log("Claves de cada item del array cargado:");
    data.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, Object.keys(item));
    });

    const orderedKeys = [
        "Monto",
        "Tipo",
        "ID",
        "Modalidad",
        "Estado",
        "Alcance",
        "Licitante",
        "Comitente",
        "Comprador",
        "Destinos",
        "Rubros",
        "Objeto",
        "Descripción",
        "FechaApertura",
        "Numero",
        "Año",
        "NumeroAño",
        "Pliego",
        "IDOrganismo",
        "LugarPresentacion",
        "FechaLimite", 
        "LugarApertura",
        "FechaApertura", 
        "LugarEntrega",
        "Expedientes",
        "pdfData",
        "Documentos"
    ];

    const keyMappings = {
        "Modalidad:": "Modalidad",
        "Estado:": "Estado",
        "Alcance:": "Alcance",
        "Objetodelagestión:": "Objetodelagestión",
        "Descripción:": "Descripción",
        "Rubros-Subrubros:": "Rubros",
        "Organismocomitente:": "Comitente",
        "Organismolicitante:": "Licitante",
        "Lugardepresentacióndeofertas:": "LugarPresentacion",
        "Fechayhoralímitedepresentacióndeofertas:": "FechaLimite",
        "Lugardeaperturadeofertas:": "LugarApertura",
        "Fechayhoradeaperturadeofertas:": "FechaApertura",
        "Lugaryfechadeentrega:": "LugarEntrega",
        "Valordelpliego:": "Pliego",
        "Expedientes:": "Expedientes",
        "MontoOriginal:": "Monto",
        "tipoGestion": "Tipo",
        "idGestion": "ID",
        "objetoCompleto": "Objeto",
        "comprador": "Comprador",
        "destinos": "Destinos",
        "fechaHoraApertura": "FechaApertura",
        "numeroGestion": "Numero",
        "anioGestion": "Año",
        "numeroAño": "NumeroAño",
        "idOrganismoGestion": "IDOrganismo",
    };

    const cleanAmount = (amount) => {
        return amount.replace(/\$/g, '').replace(/\s/g, '');
    };

    const transformData = (item) => {
        let newItem = {};
        orderedKeys.forEach(key => {
            const originalKey = Object.keys(keyMappings).find(k => keyMappings[k] === key) || key;
            if (key === 'Monto' && item[originalKey]) {
                newItem[key] = cleanAmount(item[originalKey]);
            } else if (key === 'ID' && item[originalKey]) {
                newItem[key] = `=HYPERLINK("https://santafe.gov.ar/gestionesdecompras/site/gestion.php?idGestion=${item[originalKey]}"; "${item[originalKey]}")`;
            } else if (key === 'Modalidad') {
                newItem[key] = item[originalKey] || item['tipoModalidad'] || "";
            } else if (key === 'Objeto') {
                newItem[key] = item[originalKey] || item['objeto'] || item['Objetodelagestión'] || "";
            } else if (key === 'Pliego') {
                newItem[key] = item[originalKey] || item['valorPliego'] || "";
            } else {
                newItem[key] = item[originalKey] || "";
            }
        });
    
        let pdfData = item.pdfData || [];
        newItem.pdfData = pdfData.map((pdf, index) => {
            const title = pdf.title || `SinTitulo-${index + 1}`;
            return `HYPERLINK("${pdf.url}", "${title}")`;
        }).join('\n');
    
        newItem.Documentos = pdfData.map(pdf => pdf.texto).join('\n');
    
        return newItem;
    };
    
    const transformedData = data.map(transformData);

    const headers = orderedKeys;

    const flattenedData = transformedData.map(item => {
        const row = {};
        headers.forEach(header => {
            row[header] = item[header] || '';
        });
        return row;
    });

    console.log('Headers:', headers);
    console.log('Flattened Data:', flattenedData);

    try {
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetNames = sheetInfo.data.sheets.map(sheet => sheet.properties.title);

        console.log('Sheet Names:', sheetNames);

        if (!sheetNames.includes(sheetName)) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: sheetName
                            }
                        }
                    }]
                }
            });
        }

        const existingData = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!A2:A`
        });

        const existingIds = existingData.data.values ? existingData.data.values.flat() : [];
        console.log('Existing IDs:', existingIds);

        const newData = flattenedData.filter(item => !existingIds.includes(item.ID));

        if (newData.length === 0) {
            res.status(200).send('No hay nuevos datos para añadir.');
            return;
        }

        console.log(`Updating headers on sheet ${sheetName}`);
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetName}'!A1`,
            valueInputOption: 'RAW',
            resource: { values: [headers] }
        });

        console.log(`Appending data to sheet ${sheetName}`);
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `'${sheetName}'!A2`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: newData.map(Object.values)
            }
        });

        res.status(200).send('Datos añadidos exitosamente a Google Sheets');
    } catch (error) {
        console.error('Error añadiendo datos a Google Sheets:', error);
        res.status(500).send(`Error añadiendo datos a Google Sheets: ${error.message}`);
    }
});

async function fetchSheetData(sheetName, colName) {
    try {
        const response = await fetch(`http://localhost:3000/sheets/${encodeURIComponent(sheetName)}/${encodeURIComponent(colName)}`);
        if (!response.ok) {
            throw new Error('Error al obtener datos de la hoja seleccionada');
        }
        const sheetData = await response.json();
        const idGestionArray = sheetData;
        console.log('Array de idGestion:', idGestionArray);
        return idGestionArray;
    } catch (error) {
        console.error('Error en fetchSheetData:', error);
        return [];
    }
}

async function getElements(params) {
    const queryString = createQueryString(params);
    const url = `https://www.santafe.gov.ar/gestionesdecompras/site/AppAjax.php?${queryString}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log('Respuesta completa:', data);

    if (data && data.data) {
        return data.data;
    } else {
        throw new Error('La estructura de los datos no es la esperada.');
    }
}

async function getDetail(idGestion) {
    try {
        const detailUrl = `https://www.santafe.gov.ar/gestionesdecompras/site/gestion.php?idGestion=${idGestion}&contar=1`;
        const response = await fetch(detailUrl);
        const html = await response.text();

        const dom = new JSDOM(html);
        const doc = dom.window.document;

        const campos = doc.querySelectorAll('.ver-linea-campo');
        const detalle = {};

        campos.forEach(campo => {
            const label = campo.querySelector('.ver-label');
            const value = campo.querySelector('.ver-valor, .ver-valor1, .ver-valor-lista');
            if (label && value) {
                const key = label.textContent.trim().replace(/\s+/g, '');
                const val = value.textContent.trim();
                detalle[key] = val;
            }
        });

        const pdfLinks = doc.querySelectorAll('.ver-valor-lista a');
        const pdfData = Array.from(pdfLinks).map(link => ({
            url: link.href.replace('./../', 'https://www.santafe.gov.ar/gestionesdecompras/'),
            title: link.title.trim(),
            texto: ''
        }));

        detalle.pdfData = pdfData;

        return detalle;
    } catch (error) {
        console.error('Error al obtener detalles:', error);
        throw error;
    }
}

async function extractTextFromPdf(pdfUrl) {
    try {
        console.log(`Iniciando extracción de texto para: ${pdfUrl}`);
        const response = await fetch(pdfUrl);
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        const pdfData = await pdf(data);
        const text = pdfData.text;

        console.log(`Extracción de texto completa para: ${pdfUrl}`);
        return text;
    } catch (error) {
        console.error('Error al extraer texto del PDF:', error);
        throw error;
    }
}

app.post('/start-process', async (req, res) => {
    try {
        const { tipoConsulta, anio, start, limit, estado, tipoGestion, sheetName, colName } = req.body;

        const params = {
            a: tipoConsulta,
            anio: anio,
            start: start,
            limit: limit,
            estado: estado,
            tipoGestion: tipoGestion
        };

        let existingIds = [];
        if (sheetName) {
            existingIds = await fetchSheetData(sheetName, colName);
        }

        const elements = await getElements(params);
        const filteredElements = elements.filter(item => !existingIds.includes(item.idGestion));

        for (const item of filteredElements) {
            console.log(`Procesando ID: ${item.idGestion}`);
            const detalle = await getDetail(item.idGestion);

            if (detalle.pdfData && detalle.pdfData.length > 0) {
                console.log('PDF Links and Titles for idGestion', item.idGestion, ':', detalle.pdfData);

                await Promise.all(detalle.pdfData.map(async (pdf) => {
                    console.log(`Procesando PDF: ${pdf.title}`);
                    const text = await extractTextFromPdf(pdf.url);
                    pdf.texto = text.trim();
                    console.log(`Texto extraído de ${pdf.title}`);
                }));
            }

            const dataToImport = {
                ...item,
                ...detalle
            };

            await importData([dataToImport], sheetName);
            console.log(`Datos de ID: ${item.idGestion} importados a Google Sheets`);
        }

        console.log('Proceso de importación completado.');
        res.status(200).send('Proceso de importación completado.');
    } catch (error) {
        console.error('Error durante la ejecución:', error);
        res.status(500).send(`Error durante la ejecución: ${error.message}`);
    }
});

function createQueryString(params) {
    return Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
}

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

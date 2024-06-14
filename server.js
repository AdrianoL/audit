const { google } = require('googleapis');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Cargar credenciales de la cuenta de servicio
const credentials = JSON.parse(fs.readFileSync('credentials.json'));

// Autenticar con la API de Google
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

const spreadsheetId = '1dHMn0MkBdrj1foq9QkuT8CsiExtjmj1-FMdmXNpYWrE'; // Reemplaza con el ID de tu hoja de cálculo

// Configurar body-parser para manejar solicitudes más grandes
app.use(bodyParser.json({ limit: '50mb' }));

// Ruta para servir el archivo HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/graficos', (req, res) => {
    res.sendFile(path.join(__dirname, 'graficos.html'));
});

app.get('/graficos1', (req, res) => {
    res.sendFile(path.join(__dirname, 'graficosearch.html'));
});

// Ruta para obtener los datos de una columna específica por su nombre
app.get('/sheets/:sheetName/:colName', async (req, res) => {
    const sheetName = req.params.sheetName;
    const colName = req.params.colName;

    try {
        const authClient = await auth.getClient();
        const response = await sheets.spreadsheets.values.get({
            auth: authClient,
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A:Z`, // Ajusta el rango según tus necesidades
        });

        const rows = response.data.values;
        console.log(rows);
        if (!rows || rows.length === 0) {
            res.status(404).send('No data found in the sheet');
            return;
        }

        // Buscar el índice de la columna por su nombre
        const headers = rows[0];
        const colIndex = headers.indexOf(colName);
        console.log(headers);
        console.log(colIndex);
        if (colIndex === -1) {
            res.status(404).send('Column not found');
            return;
        }

        // Extraer los datos de la columna correspondiente
        const colData = rows.slice(1).map(row => row[colIndex]);

        res.json(colData);
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        res.status(500).send('Error fetching sheet data');
    }
});

// Ruta para obtener la lista de hojas del documento
app.get('/sheets', async (req, res) => {
    console.log('shhets');
    try {
        const authClient = await auth.getClient();
        const sheetList = await sheets.spreadsheets.get({
            auth: authClient,
            spreadsheetId: spreadsheetId,
        });
        console.log(sheetList);
        const sheetsInfo = sheetList.data.sheets.map(sheet => ({
            title: sheet.properties.title,
            sheetId: sheet.properties.sheetId,
        }));
        console.log(sheetsInfo);

        res.json(sheetsInfo);
    } catch (error) {
        console.error('Error fetching sheet list:', error);
        res.status(500).send('Error fetching sheet list');
    }
});

// Ruta para obtener datos de Google Sheets en formato JSON
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

// Ruta para importar datos a Google Sheets
app.post('/import', async (req, res) => {
    const { data, sheetName } = req.body;

    // Imprimir las claves de cada item del array cargado
    console.log("Claves de cada item del array cargado:");
    data.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, Object.keys(item));
    });

    // Ordenar y formatear el JSON
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
            // Mapear claves con caracteres especiales
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

    // Obtener encabezados de todos los campos presentes en los datos
    const headers = orderedKeys;

    // Transformar los datos en un formato plano para Google Sheets
    const flattenedData = transformedData.map(item => {
        const row = {};
        headers.forEach(header => {
            row[header] = item[header] || ''; // Rellenar campos faltantes con una cadena vacía
        });
        return row;
    });

    console.log('Headers:', headers); // Debug: Mostrar encabezados
    console.log('Flattened Data:', flattenedData); // Debug: Mostrar datos aplanados

    try {
        // Verificar si la hoja existe
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetNames = sheetInfo.data.sheets.map(sheet => sheet.properties.title);

        console.log('Sheet Names:', sheetNames); // Debug: Mostrar nombres de las hojas

        if (!sheetNames.includes(sheetName)) {
            // Crear una nueva hoja si no existe
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

        // Leer datos actuales de la hoja para verificar duplicados
        const existingData = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'!A2:A`
        });

        const existingIds = existingData.data.values ? existingData.data.values.flat() : [];
        console.log('Existing IDs:', existingIds); // Debug: Mostrar IDs existentes

        // Filtrar datos para evitar duplicados
        console.log('+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****+++++*****');
        console.log(flattenedData);
        console.log(flattenedData.filter(item => !existingIds.includes(item.idGestion)));
        const newData = flattenedData.filter(item => !existingIds.includes(item.idGestion));

        if (newData.length === 0) {
            res.status(200).send('No hay nuevos datos para añadir.');
            return;
        }

        // Establecer encabezados en la hoja
        console.log(`Updating headers on sheet ${sheetName}`); // Debug: Indicador de actualización de encabezados
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${sheetName}'!A1`,
            valueInputOption: 'RAW',
            resource: { values: [headers] }
        });

        // Agregar los datos
        console.log(`Appending data to sheet ${sheetName}`); // Debug: Indicador de agregar datos
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


app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

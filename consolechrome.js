function extraerDatos(tipoConsulta, anio, inicio, limite, tipoGestion, estado) {
    // Función para cargar un script y luego ejecutar el callback
    function loadScript(url, callback) {
        const script = document.createElement('script');
        script.src = url;
        script.onload = callback;
        document.head.appendChild(script);
    }

    // URL de la consulta inicial
    const urlBase = 'https://www.santafe.gov.ar/gestionesdecompras/site/AppAjax.php';
    var params = {
        a: tipoConsulta,
        anio: anio,
        start: inicio,
        limit: limite,
        estado: estado,
        tipoGestion: tipoGestion
    };

    // Función para convertir los parámetros en una cadena de consulta
    function createQueryString(params) {
        return Object.entries(params)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
    }

    // Función para obtener el array de elementos
    async function getElements() {
        const queryString = createQueryString(params);
        const url = `${urlBase}?${queryString}`;
        const response = await fetch(url);
        const data = await response.json();
        console.log('Respuesta completa:', data); // Imprimir la respuesta completa para ver su estructura

        if (data && data.data) {
            return data.data; // Ajustar según la estructura real
        } else {
            throw new Error('La estructura de los datos no es la esperada.');
        }
    }

    // Función para obtener los detalles de un idGestion y extraer información del HTML
    async function getDetail(idGestion) {
        try {
            const detailUrl = `https://www.santafe.gov.ar/gestionesdecompras/site/gestion.php?idGestion=${idGestion}&contar=1`;
            const response = await fetch(detailUrl);
            const html = await response.text(); // Obtener el contenido HTML como texto

            // Parsear el HTML para extraer la información relevante
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Extraer todos los pares ver-label y ver-valor dentro de ver-linea-campo
            const campos = doc.querySelectorAll('.ver-linea-campo');
            const datos = {};

            campos.forEach(campo => {
                const label = campo.querySelector('.ver-label');
                const value = campo.querySelector('.ver-valor, .ver-valor1, .ver-valor-lista');
                if (label && value) {
                    const key = label.textContent.trim().replace(/\s+/g, '');
                    const val = value.textContent.trim();
                    datos[key] = val;
                }
            });

            // Extraer las URLs de los PDF y sus títulos
            const pdfLinks = doc.querySelectorAll('.ver-valor-lista a');
            const pdfData = await Promise.all(Array.from(pdfLinks).map(async (link) => {
                const pdfUrl = link.href.replace('./../', 'https://www.santafe.gov.ar/gestionesdecompras/');
                const title = link.title.trim();
                const text = await extractTextFromPDF(pdfUrl);
                return {
                    url: pdfUrl,
                    title: title,
                    text: text
                };
            }));

            datos.pdfData = pdfData;

            return datos;
        } catch (error) {
            console.error('Error al obtener detalles:', error);
            throw error;
        }
    }

    // Función para extraer texto de un PDF usando pdfjs-dist
    async function extractTextFromPDF(pdfUrl) {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const maxPages = pdf.numPages;
        const pageTextPromises = [];

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            pageTextPromises.push(pageText);
        }

        const pageTexts = await Promise.all(pageTextPromises);
        return pageTexts.join(' ');
    }

    // Función para descargar un archivo Excel con los datos
    function downloadExcel(data) {
        // Crear un libro de trabajo
        const wb = XLSX.utils.book_new();

        // Crear una hoja de trabajo con los datos
        const ws = XLSX.utils.json_to_sheet(data);

        // Agregar la hoja de trabajo al libro de trabajo
        XLSX.utils.book_append_sheet(wb, ws, 'Datos');

        // Generar el archivo Excel y descargarlo
        XLSX.writeFile(wb, 'datos.xlsx');
    }

    // Función principal para cargar datos, almacenarlos en memoria y guardarlos en un archivo Excel
    async function main() {
        try {
            // Obtener los elementos
            const elements = await getElements();

            // Almacenar los detalles en memoria
            const elementosConDetalles = await Promise.all(elements.map(async (item) => {
                const datos = await getDetail(item.idGestion); // Asumimos que el id se llama idGestion

                return {
                    ...item,
                    ...datos // Agregar el contenido HTML directamente en el objeto
                };
            }));

            console.log('Elementos con detalles HTML y textos de PDF:', elementosConDetalles);

            // Descargar los datos en un archivo Excel
            // downloadExcel(elementosConDetalles);
        } catch (error) {
            console.error('Error durante la ejecución:', error);
        }
    }

    // Cargar los scripts necesarios y luego ejecutar la función principal
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js', () => {
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.min.js', main);
    });
}

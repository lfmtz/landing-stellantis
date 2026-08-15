const url = "https://script.google.com/macros/s/AKfycbzKpyk1CqQMqxWrrALiC8JbDnEpuGdDrBSnsYr8NjZ8-aaOC2G691lw2JcydA0Vkm2G/exec";

const datos = {
    nombre: "Test Antigravity AI",
    email: "test.antigravity@example.com"
};

console.log("Enviando petición de prueba a Google Sheets...");

fetch(url, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify(datos)
})
.then(response => {
    console.log("Respuesta recibida. Status:", response.status);
    return response.text();
})
.then(text => {
    console.log("Contenido retornado:", text);
})
.catch(error => {
    console.error("Error al enviar petición:", error);
});

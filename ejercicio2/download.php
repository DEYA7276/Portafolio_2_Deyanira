<?php
/**
 * Script auxiliar de descarga forzada de PNG para Ejercicio 2
 * Garantiza que el archivo se guarde siempre con el nombre exacto 'foto.png'
 * y tipo MIME 'image/png' reconocido por Windows.
 */

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['image_data'])) {
    $rawData = $_POST['image_data'];

    // Remover encabezado data URL si viene incluido
    if (strpos($rawData, 'base64,') !== false) {
        $parts = explode('base64,', $rawData);
        $rawData = $parts[1];
    }

    $rawData = str_replace(' ', '+', $rawData);
    $binaryData = base64_decode($rawData);

    if ($binaryData === false) {
        http_response_code(400);
        echo "Error al decodificar la imagen.";
        exit;
    }

    // Cabeceras HTTP estándar para forzar descarga directa con nombre 'foto.png'
    header('Content-Description: File Transfer');
    header('Content-Type: image/png');
    header('Content-Disposition: attachment; filename="foto.png"');
    header('Content-Transfer-Encoding: binary');
    header('Expires: 0');
    header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
    header('Pragma: public');
    header('Content-Length: ' . strlen($binaryData));

    echo $binaryData;
    exit;
}

http_response_code(400);
echo "No se recibieron datos de imagen.";
exit;

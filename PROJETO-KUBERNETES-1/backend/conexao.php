<?php
/**
 * Conexão com o Banco de Dados MySQL via PDO
 */

// Recupera as credenciais das variáveis de ambiente configuradas no Kubernetes.
// Caso não estejam definidas, utiliza valores padrão seguros para desenvolvimento local.
$host = getenv('DB_HOST') ?: 'mysql-service';
$dbname = getenv('DB_NAME') ?: 'meubanco';
$user = getenv('DB_USER') ?: 'root';
$password = getenv('DB_PASSWORD') ?: 'senha123';

try {
    // Estabelece a conexão usando PDO com codificação UTF-8
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $password);
    
    // Configura o PDO para disparar exceções em caso de erros SQL
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
} catch (PDOException $e) {
    // Retorna um cabeçalho JSON indicando falha e encerra a execução
    header('Content-Type: application/json; charset=utf-8', true, 500);
    echo json_encode([
        "status" => "error",
        "message" => "Falha na conexão com o banco de dados. Verifique a orquestração do cluster.",
        "details" => $e->getMessage()
    ]);
    exit;
}
?>

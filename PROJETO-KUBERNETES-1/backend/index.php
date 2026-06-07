<?php
/**
 * API Endpoint para Gerenciamento de Comentários
 * Suporta GET (listar) e POST (criar novo comentário)
 */

// Define cabeçalhos CORS para permitir requisições do Frontend rodando localmente
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

// Responde imediatamente a requisições preflight do CORS (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Inclui o arquivo de conexão com o banco de dados
require_once 'conexao.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        try {
            // Busca todos os registros em ordem decrescente de criação
            $stmt = $pdo->query("SELECT id, nome, email, comentario, created_at FROM mensagens ORDER BY id DESC");
            $mensagens = $stmt->fetchAll();
            
            http_response_code(200);
            echo json_encode($mensagens);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                "status" => "error",
                "message" => "Erro ao listar mensagens do banco de dados.",
                "details" => $e->getMessage()
            ]);
        }
        break;

    case 'POST':
        // Lê os dados enviados no corpo da requisição (JSON)
        $input = json_decode(file_get_contents('php://input'), true);

        // Se não for JSON, tenta ler de $_POST
        if (!$input) {
            $input = $_POST;
        }

        $nome = trim($input['nome'] ?? '');
        $email = trim($input['email'] ?? '');
        $comentario = trim($input['comentario'] ?? '');

        // Validação básica dos dados recebidos
        if (empty($nome) || empty($email) || empty($comentario)) {
            http_response_code(400);
            echo json_encode([
                "status" => "error",
                "message" => "Todos os campos (nome, email, comentario) são obrigatórios para envio."
            ]);
            exit;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode([
                "status" => "error",
                "message" => "O e-mail fornecido é inválido."
            ]);
            exit;
        }

        try {
            // Insere o comentário de forma segura com Prepared Statements
            $stmt = $pdo->prepare("INSERT INTO mensagens (nome, email, comentario) VALUES (:nome, :email, :comentario)");
            $stmt->execute([
                ':nome' => $nome,
                ':email' => $email,
                ':comentario' => $comentario
            ]);

            http_response_code(201);
            echo json_encode([
                "status" => "success",
                "message" => "Comentário registrado com sucesso!"
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                "status" => "error",
                "message" => "Erro ao registrar o comentário no banco de dados.",
                "details" => $e->getMessage()
            ]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode([
            "status" => "error",
            "message" => "Método HTTP não permitido para esta operação."
        ]);
        break;
}
?>

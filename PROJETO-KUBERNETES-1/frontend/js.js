/**
 * Lógica do Frontend do Portal de Feedback
 * Comunica-se com o Backend PHP hospedado no Kubernetes
 */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('feedback-form');
    const commentsContainer = document.getElementById('comments-container');
    const messageCount = document.getElementById('message-count');
    const apiUrlInput = document.getElementById('api-url');
    const btnSaveApi = document.getElementById('btn-save-api');

    // 1. Inicializa o Endpoint da API
    // Recupera a URL da API salva no localStorage para persistência entre recarregamentos.
    let savedApiUrl = localStorage.getItem('kubernetes_project1_api_url') || '';
    
    // Se não houver URL salva e estivermos rodando via servidor web (http/https),
    // tenta usar o próprio host de origem.
    if (!savedApiUrl && window.location.protocol.startsWith('http')) {
        // Se estiver rodando no mesmo servidor que a API, a URL base será a raiz.
        savedApiUrl = window.location.origin;
    }
    
    apiUrlInput.value = savedApiUrl;

    // Helper para obter a URL da API limpa (sem barras no final)
    function getApiUrl() {
        let url = apiUrlInput.value.trim();
        if (url && url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        return url;
    }

    // Salva a URL da API no LocalStorage
    btnSaveApi.addEventListener('click', () => {
        const url = apiUrlInput.value.trim();
        localStorage.setItem('kubernetes_project1_api_url', url);
        alert('Endpoint da API salvo com sucesso! Recarregando dados...');
        loadComments();
    });

    // 2. Carrega Comentários do Banco de Dados
    async function loadComments() {
        commentsContainer.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Carregando comentários...</p>
            </div>
        `;
        
        const baseUrl = getApiUrl();
        
        // Alerta especial se rodar localmente por arquivo file:// e sem IP configurado
        if (!baseUrl && window.location.protocol === 'file:') {
            commentsContainer.innerHTML = `
                <div class="no-comments">
                    <p>⚠️ Executando localmente via arquivo local (file://)</p>
                    <p style="font-size: 0.85rem; margin-top: 0.6rem; color: var(--text-secondary);">
                        Insira o endereço IP externo do LoadBalancer obtido no Kubernetes no campo "API Endpoint" no rodapé para sincronizar com o banco.
                    </p>
                </div>
            `;
            messageCount.textContent = '0';
            return;
        }

        // Se tiver URL base, aponta para baseUrl/index.php. Senão, assume caminho relativo local
        const fetchUrl = baseUrl ? `${baseUrl}/index.php` : 'index.php';

        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                throw new Error(`Erro HTTP! status: ${response.status}`);
            }
            const data = await response.json();
            renderComments(data);
        } catch (error) {
            console.error('Falha na comunicação com o backend:', error);
            commentsContainer.innerHTML = `
                <div class="error-message">
                    <p>❌ Falha ao conectar com o Backend do Cluster.</p>
                    <p style="font-size: 0.85rem; margin-top: 0.6rem; color: #f87171;">
                        Verifique se os pods estão ativos e se a URL informada (${fetchUrl}) está correta.
                    </p>
                </div>
            `;
            messageCount.textContent = '0';
        }
    }

    // Renderiza a lista de comentários
    function renderComments(comments) {
        if (!Array.isArray(comments) || comments.length === 0) {
            commentsContainer.innerHTML = `
                <div class="no-comments">
                    <p>Nenhuma mensagem enviada até o momento.</p>
                    <p style="font-size: 0.85rem; margin-top: 0.5rem; color: var(--text-secondary);">Seja o primeiro a enviar um comentário!</p>
                </div>
            `;
            messageCount.textContent = '0';
            return;
        }

        messageCount.textContent = comments.length;
        commentsContainer.innerHTML = '';

        comments.forEach(c => {
            const card = document.createElement('div');
            card.className = 'comment-card';
            
            // Trata a formatação da data do MySQL
            const timeStr = c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : '';

            card.innerHTML = `
                <div class="comment-header">
                    <span class="comment-author">${escapeHTML(c.nome)}</span>
                    <span class="comment-email">${escapeHTML(c.email)}</span>
                </div>
                <p class="comment-body">${escapeHTML(c.comentario)}</p>
                ${timeStr ? `<span class="comment-time">${timeStr}</span>` : ''}
            `;
            commentsContainer.appendChild(card);
        });
    }

    // Função para evitar injeções de script (XSS)
    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 3. Envia novo comentário via POST
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nome = document.getElementById('nome').value.trim();
        const email = document.getElementById('email').value.trim();
        const comentario = document.getElementById('comentario').value.trim();

        const baseUrl = getApiUrl();
        const fetchUrl = baseUrl ? `${baseUrl}/index.php` : 'index.php';

        const submitBtn = document.getElementById('btn-submit');
        const originalBtnHTML = submitBtn.innerHTML;
        
        // Bloqueia o botão e mostra spinner de carregamento no envio
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Enviando...</span><div class="spinner" style="width:16px; height:16px; margin:0; border-width:2px; border-top-color:#0a0c10;"></div>';

        try {
            const response = await fetch(fetchUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ nome, email, comentario })
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                // Limpa os campos do formulário
                document.getElementById('nome').value = '';
                document.getElementById('email').value = '';
                document.getElementById('comentario').value = '';
                
                // Recarrega os comentários para exibir a nova mensagem
                loadComments();
            } else {
                alert(`Erro no processamento: ${result.message || 'Falha desconhecida'}`);
            }
        } catch (error) {
            console.error('Erro ao enviar feedback:', error);
            alert('Erro de conexão ao enviar comentário. Verifique se o backend está acessível.');
        } finally {
            // Restaura o estado original do botão de submit
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
        }
    });

    // Carrega a lista inicial
    loadComments();
});

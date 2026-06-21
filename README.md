# Implantação de Cluster Kubernetes Local - VHL Sistemas

Este projeto cria um ambiente Kubernetes local (K3s) contendo uma aplicação PHP conectada a um banco MySQL persistente.

---

## 1. Arquitetura

O ambiente utiliza duas máquinas virtuais gerenciadas pelo Vagrant:

```text
[Navegador Host] --> http://192.168.56.10:30001 --> [NodePort Service]
                                                           │
                                                  [3x Pods PHP/Apache]
                                                           │
                                                [ClusterIP: mysql-service]
                                                           │
                                                   [Pod MySQL 8.0]
                                                           │
                                               [PVC 5Gi - Persistent Volume]
```

### Componentes

*   `vhl-master` (`192.168.56.10` - 2 vCPUs, 2GB RAM): Nó Control Plane. Gerencia o cluster, responde a comandos do `kubectl` e define a alocação de recursos.
*   `vhl-worker` (`192.168.56.11` - 2 vCPUs, 2GB RAM): Nó Worker. Executa os containers da aplicação, do banco de dados e do Zabbix.
*   **Orquestração:** K3s.
*   **Banco de Dados:** MySQL 8.0 com armazenamento persistente local (`Local Path Provisioner`).
*   **Aplicação:** PHP 8.1 (Apache) com 3 réplicas e conexão MySQL ativa.
*   **Monitoramento:** Zabbix Appliance no namespace `monitoring`, exposto na porta `30080` (`Admin` / `zabbix`).

---

## 2. Instruções de Execução

### Pré-requisitos (Windows)
Instale as seguintes ferramentas:
*   VirtualBox 7.x
*   Vagrant 2.4.x
*   Git
*   Virtualização de Hardware ativa na BIOS

### Desativação do Hyper-V
Evite travamentos de CPU (`soft lockup`) desativando o hypervisor do Windows:
1. Abra o PowerShell como Administrador.
2. Execute o comando:
   ```powershell
   bcdedit /set hypervisorlaunchtype off
   ```
3. Reinicie o computador.

Para reativar o Hyper-V após os testes, execute:
```powershell
bcdedit /set hypervisorlaunchtype auto
```

---

### Execução

1. Clone o repositório e acesse o diretório:
   ```powershell
   git clone <URL_DO_REPOSITORIO>
   cd TESTE-VHL-SISTEMAS
   ```

2. Inicie as máquinas virtuais:
   ```powershell
   vagrant up
   ```
   *Nota: O download do SO e a instalação do K3s levam cerca de 5 minutos.*

3. Acesse a máquina master por SSH:
   ```powershell
   vagrant ssh vhl-master
   ```

4. Aplique os manifestos do Kubernetes:
   ```bash
   sudo kubectl apply -f /vagrant/k8s/secrets.yml
   sudo kubectl apply -f /vagrant/k8s/volumes.yml
   sudo kubectl apply -f /vagrant/k8s/mysql.yml
   sudo kubectl apply -f /vagrant/k8s/app.yml
   sudo kubectl apply -f /vagrant/k8s/monitoring/zabbix.yml
   ```

5. Acompanhe a inicialização dos pods:
   ```bash
   sudo kubectl get pods -A -w
   ```
   *O MySQL pode levar até 2 minutos para gravar os metadados iniciais no primeiro deploy.*

6. Teste o acesso à aplicação:
   Acesse [http://192.168.56.10:30001](http://192.168.56.10:30001) e envie uma mensagem para testar a persistência no MySQL.

7. Teste o acesso ao Zabbix:
   Acesse [http://192.168.56.10:30080](http://192.168.56.10:30080).
   *   **Usuário:** `Admin`
   *   **Senha:** `zabbix`

---

## 3. Justificativas de Projeto

*   **VirtualBox:** Simula um ambiente multinó local idêntico à produção, oferecendo suporte estável a redes privadas e volumes.
*   **K3s:** Distribuição leve do Kubernetes que economiza CPU e memória RAM das VMs, mantendo compatibilidade com a API padrão do Kubernetes.
*   **Imagem PHP (`chialab/php:8.1-apache`):** Contém o driver `pdo_mysql` nativo. Evita o uso de `initContainers` para compilar extensões a cada deploy, o que exigiria internet e aumentaria o tempo de inicialização de segundos para minutos.
*   **Health Probes Independentes:**
    *   `livenessProbe`: Monitora `/index.html` estático. Impede que falhas temporárias no banco reiniciem os containers do PHP.
    *   `readinessProbe`: Valida a conexão com o banco em `/index.php`. Se o MySQL falhar, o pod PHP para de receber tráfego sem ser reiniciado.
*   **Estratégia `Recreate` no MySQL:** Evita conflitos no volume `ReadWriteOnce`. Garante que o pod antigo libere o disco antes do novo tentar montá-lo.
*   **Provisionamento via Shell Script no Vagrant:** Mantém o fluxo centralizado em um único arquivo de configuração. Evita o uso de Terraform ou Ansible locais, que demandariam binários extras e dependeriam de providers de terceiros pouco estáveis.
*   **Zabbix Appliance:** Aproveita a familiaridade prévia com a ferramenta para implantar rapidamente o monitoramento web integrado a um único container.

---

## 4. Resolução de Problemas (Diário de Bordo)

### 4.1 VMs travadas no boot (Timeout de SSH no Windows)
*   **Problema:** O comando `vagrant up` travava em `Waiting for machine to boot...` devido ao conflito entre VirtualBox e Hyper-V em processadores AMD Ryzen.
*   **Solução:** Desativei o hypervisor temporariamente rodando `bcdedit /set hypervisorlaunchtype off` no PowerShell e reiniciando a máquina.

### 4.2 Inicialização lenta do PHP (compilação sob demanda)
*   **Problema:** Compilar o driver MySQL em tempo de execução via `initContainers` tornava o deploy demorado e suscetível a quedas de conexão externa.
*   **Solução:** Substituí a imagem pela `chialab/php:8.1-apache`, que já traz as extensões necessárias pré-instaladas.

### 4.3 Loop de reinício no PHP em caso de indisponibilidade do banco
*   **Problema:** A liveness probe testava `/index.php`. Se o MySQL demorasse para inicializar, a probe falhava e o Kubernetes reiniciava o container PHP em loop.
*   **Solução:** Direcionei a liveness probe para o `/index.html` estático e mantive a readiness probe no `/index.php`.

### 4.4 Erro VERR_ALREADY_EXISTS no VirtualBox
*   **Problema:** Arquivos de execuções anteriores corrompidos impediam a criação da VM do worker.
*   **Solução:** Excluí manualmente a pasta `.\VirtualBox VMs\vhl-worker` no Windows.

### 4.5 Loop de reinício do MySQL no primeiro deploy
*   **Problema:** A liveness probe padrão de 15 segundos falhava porque o MySQL leva mais tempo para estruturar e gravar os arquivos iniciais no primeiro boot.
*   **Solução:** Aumentei o `initialDelaySeconds` da liveness probe do MySQL para 180 segundos.

### 4.6 Volume persistente travado (PVC) durante atualizações
*   **Problema:** Novos pods tentavam acessar o volume `ReadWriteOnce` enquanto o pod antigo ainda segurava a montagem do disco.
*   **Solução:** Mudei a estratégia de deploy do MySQL para `Recreate`.

### 4.7 Erro "Host not allowed to connect" no MySQL
*   **Problema:** Arquivos residuais no PVC impediam a inicialização correta dos dados do banco e a devida criação do usuário da aplicação.
*   **Solução:** Excluí o PVC antigo e limpei o diretório local para forçar uma inicialização do zero.

### 4.8 Erro de sintaxe YAML no `.gitlab-ci.yml`
*   **Problema:** O GitLab se perdia com as chaves `{}` do comando inline do `yamllint` e interpretava a linha como um bloco estrutural do pipeline.
*   **Solução:** Envolvi o comando inline em aspas simples (`'...'`).

### 4.9 Falta de terminal na imagem oficial do kubectl
*   **Problema:** A imagem distroless do `kubectl` falhava no GitLab Runner por não possuir `/bin/sh` ou `bash`.
*   **Solução:** Mudei a imagem base do job para `alpine:latest` e instalei o `kubectl` dinamicamente com `curl` no `before_script`.

### 4.10 Conexão recusada do kubectl local na pipeline
*   **Problema:** Mesmo com dry-run local (`--dry-run=client`), o `kubectl` tentava se comunicar com um cluster para validar o esquema de APIs.
*   **Solução:** Adicionei a flag `--validate=false` para realizar apenas validações locais e isoladas do cluster.

---

## 5. Credenciais do Banco de Dados

| Variável | Valor |
|----------|-------|
| Root Password | `Senha@Root123` |
| Database | `meubanco` |
| User | `user_app` |
| Password | `Senha@App456` |

*Nota: Credenciais armazenadas em segredo (Secrets) no Kubernetes.*

---

## 6. Configuração do Monitoramento (Zabbix)

Instruções para configurar o monitoramento web da aplicação após acessar a interface (`Admin` / `zabbix` em `http://192.168.56.10:30080`):

### 6.1 Limpeza do Painel
O Zabbix Server gera um alerta falso de agente indisponível porque o container roda sem o Zabbix Agent.
1. Acesse **Configuration** > **Hosts**.
2. Localize o host **`Zabbix server`**.
3. Na coluna **Status**, mude de **Enabled** para **Disabled**.

### 6.2 Cadastro da Aplicação
1. Acesse **Configuration** > **Hosts** e clique em **Create host**.
2. Preencha os campos:
   * **Host name:** `Portal Web VHL`
   * **Templates:** Escolha `Template App HTTP Service`.
   * **Groups:** Selecione `Virtual machines`.
   * **Interfaces:** Clique em **Add**, escolha **Agent**, mantenha `127.0.0.1` na porta `10050`.
3. Salve clicando em **Add**.

### 6.3 Criação do Cenário Web
Simula o acesso do usuário para validar o PHP e a conexão ao MySQL:
1. Na listagem de hosts, vá na linha do `Portal Web VHL` e selecione **Web**.
2. Clique em **Create web scenario**.
3. Na guia **Scenario**:
   * **Name:** `Acesso Portal`
   * **Update interval:** `1m`
4. Na guia **Steps**, clique em **Add**:
   * **Name:** `Home Page`
   * **URL:** `http://app-service.default.svc.cluster.local/index.php` (DNS do serviço Kubernetes)
   * **Required status codes:** `200` (Garante alerta se a conexão com o MySQL falhar)
5. Salve o passo e o cenário.

### 6.4 Visualização
Acompanhe os gráficos e tempos de resposta em **Monitoring** > **Web** > **Portal Web VHL**.

---

## 7. Apontamentos de Segurança (Apenas Teste)

Este projeto contém práticas inadequadas para produção. Como o ambiente serve para testes locais, ignore estas pendências:

* **Credenciais expostas:** O arquivo `secrets.yml` armazena senhas em Base64 e possui comentários com texto limpo.
* **Privilégios elevados:** Os contêineres rodam como root devido à ausência de `securityContext`.
* **Rede aberta:** A ausência de `NetworkPolicy` deixa o MySQL exposto a qualquer pod do cluster.
* **Segurança no pipeline:** A esteira de CI/CD não executa varreduras de código ou de dependências (SAST e SCA).

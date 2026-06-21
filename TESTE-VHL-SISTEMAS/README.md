# Teste Técnico DevOps - VHL Sistemas

O objetivo é implantar um ambiente local com um cluster Kubernetes funcional rodando uma aplicação PHP integrada a um banco de dados MySQL persistente.

---

## 1. Resumo

Foi construída uma arquitetura de infraestrutura local de alta disponibilidade e resiliência baseada em máquinas virtuais e containers:

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

### Componentes Principais
*   **Virtualização & Topologia de VMs:** 2 Máquinas Virtuais gerenciadas pelo Vagrant (Ubuntu 22.04 Jammy) separando as camadas de gerência e execução:
    *   `vhl-master` (IP `192.168.56.10` - 2 vCPUs, 2GB RAM): **Nó Control Plane (Master)**. O objetivo desta VM é coordenar o estado geral do cluster. Ela roda a API do Kubernetes (`kube-apiserver`), o gerenciador de estado (`kube-controller-manager`), o agendador de recursos (`kube-scheduler`) e o banco de dados interno de configuração (Kine/SQLite no K3s). Ela serve como console central de administração, recebendo os comandos do `kubectl` e decidindo onde alocar os pods.
    *   `vhl-worker` (IP `192.168.56.11` - 2 vCPUs, 2GB RAM): **Nó de Execução (Worker / Agent)**. O objetivo desta VM é executar as cargas de trabalho reais (workloads). Ela executa o agente `kubelet` que reporta a saúde da VM para o master, o runtime de containers (`containerd`) e o roteador de rede (`kube-proxy`). Ela roda fisicamente os pods da aplicação, do banco de dados e do Zabbix, garantindo que os containers tenham os recursos físicos de CPU/RAM para operar.
*   **Orquestração:** Cluster Kubernetes utilizando **K3s** (distribuição leve e certificada pela CNCF).
*   **Banco de Dados:** MySQL 8.0 com armazenamento persistente local (`Local Path Provisioner` do K3s) persistido através de `PersistentVolumeClaim`.
*   **Aplicação:** Web server Apache executando PHP 8.1 pré-compilado com a extensão `pdo_mysql`, com 3 réplicas para balanceamento de carga.
*   **Monitoramento & Alertas (Observabilidade):** Zabbix Appliance implantado no namespace `monitoring` consolidando o Zabbix Server, banco de dados local e o Frontend Web em um único container leve. A interface do Zabbix é exposta via NodePort na porta `30080` (credenciais padrão: `Admin` / `zabbix`).

---

## 2. Passo a Passo para Execução

### Pré-requisitos
Antes de começar, instale na sua máquina física (Windows Host):
1.  **VirtualBox (versão 7.x)**
2.  **Vagrant (versão 2.4.x)**
3.  **Git**
4.  **Virtualização de Hardware ativa** na BIOS do seu computador.

### Configuração Recomendada (Desativar Hyper-V)
Para que as máquinas virtuais não tenham travamentos de CPU (`soft lockup`), desative temporariamente o hypervisor do Windows:
1. Abra o **PowerShell como Administrador**.
2. Execute o comando:
   ```powershell
   bcdedit /set hypervisorlaunchtype off
   ```
3. **Reinicie seu computador físico**.
*(Nota: Para habilitar o Hyper-V novamente após o teste, basta rodar `bcdedit /set hypervisorlaunchtype auto` e reiniciar).*

---

### Executando o Ambiente

#### Passo 2.1: Clonar o Repositório
Abra seu terminal e clone este repositório:
```powershell
git clone <URL_DO_REPOSITORIO>
cd "TESTE-VHL-SISTEMAS"
```

#### Passo 2.2: Subir as VMs com Vagrant
Inicie a criação e provisionamento das máquinas virtuais do cluster:
```powershell
vagrant up
```
*Este processo leva entre 3 e 5 minutos, pois faz o download do sistema operacional e instala o K3s automaticamente nos dois nós.*

#### Passo 2.3: Acessar a VM Master via SSH
Acesse a console da VM controladora:
```powershell
vagrant ssh vhl-master
```

#### Passo 2.4: Aplicar os Manifestos do Kubernetes
Dentro do terminal da VM Master, aplique os arquivos de configuração que estão mapeados na pasta `/vagrant`:
```bash
# Manifestos Base da Aplicação
sudo kubectl apply -f /vagrant/k8s/secrets.yml
sudo kubectl apply -f /vagrant/k8s/volumes.yml
sudo kubectl apply -f /vagrant/k8s/mysql.yml
sudo kubectl apply -f /vagrant/k8s/app.yml

# Manifesto de Observabilidade (Monitoramento e Alertas Zabbix)
sudo kubectl apply -f /vagrant/k8s/monitoring/zabbix.yml
```

#### Passo 2.5: Validar a Inicialização
Acompanhe os pods até que todos estejam no status `1/1 READY` nos namespaces `default` e `monitoring`:
```bash
# Validando aplicação e banco
sudo kubectl get pods -n default -w

# Validando monitoramento
sudo kubectl get pods -n monitoring
```
*Nota: Na primeira execução, o MySQL pode demorar de 1 a 2 minutos gravando seus metadados iniciais antes de ficar pronto.*

#### Passo 2.6: Acessar a Aplicação
Abra o navegador no seu computador host (Windows) e acesse:
👉 **[http://192.168.56.10:30001](http://192.168.56.10:30001)**

Insira uma mensagem de teste e clique em enviar para validar a persistência no banco de dados.

#### Passo 2.7: Acessar o Painel de Monitoramento (Zabbix)
Para acessar o painel de monitoramento do Zabbix, abra no navegador do seu computador host:
👉 **[http://192.168.56.10:30080](http://192.168.56.10:30080)**

*   **Usuário padrão:** `Admin`
*   **Senha padrão:** `zabbix`

*(Dentro do Zabbix, você pode cadastrar a URL `http://app-service.default.svc.cluster.local` em um cenário web para testar a disponibilidade do frontend e backend. As regras de alertas básicas já vêm ativas por padrão).*

---

## 3. Decisões Técnicas

*   **VirtualBox:** Escolhido por ser o padrão da indústria para simular ambientes multinó de infraestrutura local de forma idêntica à produção física/virtualizada, garantindo que o comportamento de redes privadas e discos persista localmente de forma simples.
*   **K3s (Kubernetes):** Escolhido em vez do Kubernetes padrão (Kubeadm) ou Minikube por consumir muito menos memória RAM e CPU nas VMs locais, entregando ao mesmo tempo uma API do Kubernetes 100% compatível e pronta para produção.
*   **Uso de Imagem PHP Pré-compilada (`chialab/php:8.1-apache`):** Em vez de compilar a extensão de banco de dados (`pdo_mysql`) via `initContainers` a cada inicialização de pod (o que demoraria minutos e dependeria de conexão à internet no deploy), optamos por uma imagem certificada que já traz o driver nativo. O deploy agora ocorre em menos de 3 segundos.
*   **Desacoplamento de Health Probes (Liveness vs. Readiness):**
    *   `livenessProbe`: Testa apenas a saúde do processo Apache (`/index.html`). Se o banco de dados cair, o PHP não será reiniciado em loop.
    *   `readinessProbe`: Testa o arquivo dinâmico `/index.php` (conexão com o banco). Se o MySQL estiver fora do ar, o pod PHP permanece vivo, mas deixa de receber tráfego de usuários até a conexão se restabelecer.
*   **Estratégia de Deploy `Recreate` para MySQL:** O K3s usa volumes do tipo `ReadWriteOnce`. Na atualização de deployments, o Kubernetes tenta subir o pod novo antes de desligar o antigo. Usando a estratégia `Recreate`, garantimos que o pod antigo libere o disco antes que o novo tente montá-lo, evitando travamentos de volume travado.
*   **Raciocínio de não usar Terraform/Ansible:** Decidiu-se manter o provisionamento centralizado no `Vagrantfile` via shell script. O uso de Terraform local exigiria a instalação de binários adicionais e o uso de providers do VirtualBox instáveis mantidos pela comunidade. O Vagrant resolve a infraestrutura local em um único arquivo limpo e nativo.
*   **Escolha do Zabbix para Observabilidade:** Como eu trabalho e utilizo o Zabbix no meu trabalho atual, pela ambientação foi o que mais me encaixou para a parte de monitoramento. Essa familiaridade facilitou a implantação rápida do Zabbix Appliance (consolidando o Server, banco e web em um único pod) e a configuração do cenário de teste web para validar a aplicação de ponta a ponta.

---

## 4. Troubleshooting (Diário de Correções)

Aqui estão descritas de forma simples e humanizada as principais dificuldades enfrentadas durante o desenvolvimento e como foram corrigidas:

### 4.1 O travamento de boot (Timeout de SSH) nas VMs no Windows
*   **O que tentei fazer primeiro:** Iniciei o `vagrant up` para subir as VMs.
*   **Por que deu problema?** O boot travou em `Waiting for machine to boot...` até dar timeout. Isso aconteceu porque o Windows estava com o Hyper-V (usado pelo WSL2/Docker Desktop) ativo. O VirtualBox rodando junto com o Hyper-V em processadores AMD Ryzen entra em modo NEM, tornando a emulação extremamente lenta e impedindo o boot do Linux.
*   **Como corrigi:** Desativei o hypervisor executando `bcdedit /set hypervisorlaunchtype off` no PowerShell e reiniciando a máquina.

### 4.2 A inicialização lenta do PHP (compilação sob demanda)
*   **O que tentei fazer primeiro:** Usei um container de inicialização (`initContainer`) para compilar o driver MySQL na imagem base oficial do PHP Apache.
*   **Por que deu problema?** O deploy demorava muito tempo e dependia de baixar pacotes da internet. Se a internet caísse, o pod entrava em erro de crash.
*   **Como corrigi:** Mudei a imagem para `chialab/php:8.1-apache` que já possui os drivers pré-instalados.

### 4.3 Loop de reinício do PHP se o banco caísse
*   **O que tentei fazer primeiro:** Apontei a liveness probe para o `/index.php`.
*   **Por que deu problema?** Como o index consulta o banco, se o MySQL demorasse a subir ou ficasse temporariamente fora do ar, a probe falhava e o Kubernetes reiniciava o container PHP em loop infinito.
*   **Como corrigi:** Mudei a liveness probe para monitorar o `/index.html` estático e mantive a readiness probe no `/index.php`.

### 4.4 Erro de diretório existente no VirtualBox (VERR_ALREADY_EXISTS)
*   **O que tentei fazer primeiro:** Rodei o comando `vagrant up`.
*   **Por que deu problema?** O VirtualBox falhou com o erro informando que o diretório da VM do worker já existia devido a uma criação anterior corrompida.
*   **Como corrigi:** Removi manualmente a pasta `.\VirtualBox VMs\vhl-worker` no host Windows.

### 4.5 Loop de reinício do MySQL no primeiro deploy
*   **O que tentei fazer primeiro:** Configurei a liveness probe do MySQL para começar em 15 segundos.
*   **Por que deu problema?** No primeiro deploy, o MySQL demora cerca de 1 a 2 minutos gravando as tabelas e arquivos do banco de dados na VM. A probe de 15 segundos falhava por não achar a porta aberta e reiniciava o MySQL antes que ele terminasse de criar os arquivos.
*   **Como corrigi:** Aumentei o tempo de espera inicial (`initialDelaySeconds`) da liveness probe do MySQL para 180 segundos.

### 4.6 Travamento de volume persistente (PVC) no update
*   **O que tentei fazer primeiro:** Executei atualização do manifesto do MySQL.
*   **Por que deu problema?** O novo pod tentava ler o volume persistente enquanto o pod antigo ainda estava ativo e bloqueando o disco (ReadWriteOnce).
*   **Como corrigi:** Alerei a estratégia de deploy do MySQL para `Recreate`.

### 4.7 Erro de permissão ao banco (Host not allowed to connect)
*   **O que tentei fazer primeiro:** Re-apliquei as configurações do MySQL mantendo os arquivos antigos do volume persistente.
*   **Por que deu problema?** Havia arquivos de deploys anteriores corrompidos no disco virtual. O MySQL pulou a inicialização dos dados e não criou o usuário `user_app` com permissões de rede.
*   **Como corrigi:** Excluí o PVC anterior e limpei o diretório físico, forçando o MySQL a realizar uma instalação limpa onde criou o usuário e senhas com permissões de rede corretas.

### 4.8 Erro de sintaxe YAML no `.gitlab-ci.yml` (`did not find expected key while parsing a block mapping`)
*   **O que tentei fazer primeiro:** Configurei a chamada do `yamllint` passando as regras inline no formato JSON: `yamllint -d "{rules: {line-length: disable, document-start: disable}}"`.
*   **Por que deu problema?** O analisador de YAML do GitLab se confundiu com os caracteres de chaves `{}` do comando inline do shell, achando que eram blocos de mapeamento estruturais do próprio arquivo de pipeline, travando o parser.
*   **Como corrigi:** Envolvi toda a linha do comando em aspas simples (`'...'`), fazendo com que o analisador interprete a linha como uma string de texto contínua.

### 4.9 Erro de falta de shell na imagem oficial do kubectl (`exec: "sh": executable file not found in $PATH`)
*   **O que tentei fazer primeiro:** Usei a imagem oficial `registry.k8s.io/kubectl:v1.28.2` no runner da pipeline para rodar as validações.
*   **Por que deu problema?** A imagem oficial é do tipo "distroless" (construída apenas com o binário compilado e sem sistema operacional base). Como ela não possui um shell (como `/bin/sh` ou `bash`), o GitLab Runner falhou ao tentar iniciar a etapa de script que executa os comandos de validação.
*   **Como corrigi:** Alterei a imagem base do job para `alpine:latest` (que possui shell nativo) e fiz o download dinâmico do executável oficial do `kubectl` usando o `curl` no `before_script`.

### 4.10 Erro de conexão recusada do kubectl na pipeline (`localhost:8080 was refused`)
*   **O que tentei fazer primeiro:** Executei `kubectl apply --dry-run=client -f <arquivo>` para testar a validade dos manifestos de forma estática.
*   **Por que deu problema?** Mesmo especificando o dry-run no lado do cliente, o `kubectl` tenta por padrão contactar o servidor do API do Kubernetes para buscar o esquema OpenAPI para validação de campos. Como o container do runner do GitLab está offline e sem um cluster Kubernetes rodando dentro dele, o comando falhou por conexão recusada.
*   **Como corrigi:** Adicionei a flag `--validate=false` aos comandos, instruindo o `kubectl` a verificar somente a estrutura gramatical e a lógica do manifesto local sem tentar alcançar o cluster.

---

## 5. Credenciais do Banco de Dados

| Variável | Valor |
|----------|-------|
| Root Password | `Senha@Root123` |
| Database | `meubanco` |
| User | `user_app` |
| Password | `Senha@App456` |

> Todas as credenciais são mantidas de forma segura através do Kubernetes Secrets (codificadas em Base64).

---

## 6. Configuração e Uso do Zabbix (Observabilidade)

Para comprovar a coleta de métricas e alertas ativos (item complementar do teste), implantamos o **Zabbix Appliance** no cluster. Siga o passo a passo a seguir para configurar e verificar o monitoramento da aplicação.

### Passo 6.1: Acessar a Interface do Zabbix
Abra o navegador no seu host Windows e acesse:  
👉 **[http://192.168.56.10:30080](http://192.168.56.10:30080)**  
*   **Usuário padrão:** `Admin`  
*   **Senha padrão:** `zabbix`

### Passo 6.2: Desativar Alertas de Auto-Monitoramento
Como o Zabbix Appliance não roda o daemon local do Zabbix Agent por padrão, o Zabbix Server acusará um alerta de indisponibilidade de agente para si mesmo no dashboard principal. Para limpar o painel:
1. No menu superior/lateral, vá em **Configuration** (Configuração) ➡️ **Hosts**.
2. Localize a linha do host **`Zabbix server`**.
3. Na coluna **Status**, clique no link verde **Enabled** (Ativo) para alterá-lo para **Disabled** (Inativo/Vermelho).
4. O painel principal (Global View) ficará 100% limpo de problemas.

### Passo 6.3: Criar o Host da Aplicação Portal Web
1. No menu **Configuration** ➡️ **Hosts**, clique no botão **Create host** (Criar host) no canto superior direito.
2. Preencha os campos obrigatórios:
   * **Host name:** `Portal Web VHL`
   * **Templates:** Clique em *Select* (Selecionar), procure e marque o template **`Template App HTTP Service`** (destacado na popup de templates) e clique em *Select*.
   * **Groups:** Clique em *Select*, marque o grupo **`Virtual machines`** e confirme.
   * **Interfaces:** Clique em *Add*, selecione *Agent* e configure com o IP padrão `127.0.0.1` na porta `10050`.
3. Clique em **Add** (Adicionar) no final da página para salvar.

### Passo 6.4: Criar o Cenário de Teste Web (Web Scenario)
Dessa forma o Zabbix fará requisições HTTP reais de dentro do cluster simulando o usuário, testando o PHP e a conexão com o banco MySQL:
1. Na lista de Hosts, na linha do host `Portal Web VHL`, clique em **Web** (Cenários Web).
2. Clique em **Create web scenario** (Criar cenário web) no canto superior direito.
3. Na aba **Scenario**, configure:
   * **Name:** `Acesso Portal`
   * **Update interval:** `1m`
4. Na aba **Steps** (Passos), clique em **Add** (Adicionar) e configure o passo:
   * **Name:** `Home Page`
   * **URL:** `http://app-service.default.svc.cluster.local/index.php` *(DNS interno do serviço Kubernetes)*
   * **Required status codes:** `200` *(Força o Zabbix a acusar erro caso o PHP retorne HTTP 500 se o MySQL cair)*
   * Clique em **Add** no modal do passo.
5. Clique em **Add** no rodapé do formulário principal do cenário para salvar.

### Passo 6.5: Visualizar Gráficos e Coleta de Métricas
Para visualizar as métricas coletadas em tempo real:
1. No menu superior horizontal, clique em **Monitoring** (Monitoramento) ➡️ **Web**.
2. Clique no nome do cenário **`Portal Web VHL`**.
3. A tela exibirá a resposta HTTP `200 OK` e os gráficos de tempo de resposta e velocidade de download.

---

## 7. Apontamentos de Segurança (Apenas Teste)

Este projeto contém práticas inadequadas para produção. Como o ambiente serve para testes locais, ignore estas pendências:

* **Credenciais expostas:** O arquivo `secrets.yml` armazena senhas em Base64 e possui comentários com texto limpo.
* **Privilégios elevados:** Os contêineres rodam como root devido à ausência de `securityContext`.
* **Rede aberta:** A ausência de `NetworkPolicy` deixa o MySQL exposto a qualquer pod do cluster.
* **Segurança no pipeline:** A esteira de CI/CD não executa varreduras de código ou de dependências (SAST e SCA).

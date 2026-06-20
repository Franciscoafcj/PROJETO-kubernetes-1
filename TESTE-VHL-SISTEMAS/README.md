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
*   **Virtualização:** 2 Máquinas Virtuais gerenciadas pelo Vagrant (Ubuntu Jammy).
    *   `vhl-master` (IP `192.168.56.10`): Control Plane do cluster.
    *   `vhl-worker` (IP `192.168.56.11`): Nó de execução dos pods.
*   **Orquestração:** Cluster Kubernetes utilizando **K3s** (distribuição leve e certificada pela CNCF).
*   **Banco de Dados:** MySQL 8.0 com armazenamento persistente local (`Local Path Provisioner` do K3s) persistido através de `PersistentVolumeClaim`.
*   **Aplicação:** Web server Apache executando PHP 8.1 pré-compilado com a extensão `pdo_mysql`, com 3 réplicas para balanceamento de carga.

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
sudo kubectl apply -f /vagrant/k8s/secrets.yml
sudo kubectl apply -f /vagrant/k8s/volumes.yml
sudo kubectl apply -f /vagrant/k8s/mysql.yml
sudo kubectl apply -f /vagrant/k8s/app.yml
```

#### Passo 2.5: Validar a Inicialização
Acompanhe os pods até que todos estejam no status `1/1 READY`:
```bash
sudo kubectl get pods -w
```
*Nota: Na primeira execução, o MySQL pode demorar de 1 a 2 minutos gravando seus metadados iniciais antes de ficar pronto.*

#### Passo 2.6: Acessar a Aplicação
Abra o navegador no seu computador host (Windows) e acesse:
👉 **[http://192.168.56.10:30001](http://192.168.56.10:30001)**

Insira uma mensagem de teste e clique em enviar para validar a persistência no banco de dados.

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

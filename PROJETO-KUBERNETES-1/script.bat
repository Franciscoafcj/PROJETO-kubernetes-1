@echo off
:: ==============================================================================
:: SCRIPT DE AUTOMACÃO DE DEPLOYMENT (DOCKER & KUBERNETES)
:: Projeto 1: Deploy de Aplicação Distribuída (DIO)
:: ==============================================================================
chcp 65001 > nul
title DevOps Automation - Kubernetes Deploy

:: --- CONFIGURAÇÕES DO SCRIPT ---
:: ATENÇÃO: Altere esta variável com o seu nome de usuário do Docker Hub
set DOCKER_USER=***
set BACKEND_IMAGE=projeto-backend:1.0
set DATABASE_IMAGE=projeto-database:1.0

echo ======================================================================
echo   INICIANDO COMPILACÃO E DEPLOYMENT DA APLICACÃO NO KUBERNETES
echo   Usuário Docker Hub: %DOCKER_USER%
echo ======================================================================
echo.

:: --- PASSO 1: DOCKER BUILD ---
echo [PASSO 1/3] Construindo imagens locais do Docker...
echo ----------------------------------------------------------------------

echo Construindo imagem do Backend (PHP)...
docker build -t %DOCKER_USER%/%BACKEND_IMAGE% ./backend
if %ERRORLEVEL% neq 0 (
    echo.
    echo ❌ ERRO: Falha ao compilar a imagem do Backend.
    goto error
)
echo.

echo Construindo imagem do Banco de Dados (MySQL)...
docker build -t %DOCKER_USER%/%DATABASE_IMAGE% ./database
if %ERRORLEVEL% neq 0 (
    echo.
    echo ❌ ERRO: Falha ao compilar a imagem do Banco de Dados.
    goto error
)
echo.
echo ✔️ Imagens locais compiladas com sucesso!
echo.

:: --- PASSO 2: DOCKER PUSH ---
echo [PASSO 2/3] Enviando imagens para o registro (Docker Hub)...
echo ----------------------------------------------------------------------
echo Pressione qualquer tecla para fazer o envio das imagens.
echo (Certifique-se de estar logado via comando "docker login" antes).
pause > nul
echo.

echo Enviando imagem do Backend...
docker push %DOCKER_USER%/%BACKEND_IMAGE%
if %ERRORLEVEL% neq 0 (
    echo.
    echo ❌ ERRO: Falha ao enviar a imagem do Backend.
    goto error
)
echo.

echo Enviando imagem do Banco de Dados...
docker push %DOCKER_USER%/%DATABASE_IMAGE%
if %ERRORLEVEL% neq 0 (
    echo.
    echo ❌ ERRO: Falha ao enviar a imagem do Banco de Dados.
    goto error
)
echo.
echo ✔️ Imagens enviadas com sucesso para o Docker Hub!
echo.

:: --- PASSO 3: KUBECTL APPLY ---
echo [PASSO 3/3] Aplicando manifestos no cluster Kubernetes...
echo ----------------------------------------------------------------------
echo Pressione qualquer tecla para aplicar as configurações no Cluster.
pause > nul
echo.

echo Criando Servicos (ClusterIP & LoadBalancer)...
kubectl apply -f services.yml
if %ERRORLEVEL% neq 0 (
    echo.
    echo ❌ ERRO: Falha ao aplicar services.yml.
    goto error
)
echo.

echo Criando Deployments e Armazenamento (PVC, MySQL, PHP)...
kubectl apply -f deployment.yml
if %ERRORLEVEL% neq 0 (
    echo.
    echo ❌ ERRO: Falha ao aplicar deployment.yml.
    goto error
)
echo.

echo ======================================================================
echo   ✔️ PROCESSO FINALIZADO COM SUCESSO!
echo ======================================================================
echo Os recursos foram criados no cluster.
echo Utilize: "kubectl get pods" e "kubectl get svc" para verificar o status.
echo.
pause
exit /b 0

:error
echo.
echo ======================================================================
echo   ❌ FALHA NO PROCESSO DE DEPLOYMENT
echo ======================================================================
echo Corrija os erros listados acima e execute o script novamente.
echo.
pause
exit /b 1

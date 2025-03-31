document.getElementById('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const email = document.getElementById('register-email').value;
    const senha = document.getElementById('register-password').value;

    const response = await fetch('http://localhost:3000/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, senha }),
    });

    const result = await response.json();
    document.getElementById('message').innerText = result.resultado;
});

document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-password').value;

    const response = await fetch('http://localhost:3000/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, senha }),
    });

    const result = await response.json();
    document.getElementById('message').innerText = result.resultado;
});

document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("LoginForm");
    const materiaSelector = document.getElementById("materiaSelector");
    const disciplinaSelect = document.getElementById("disciplina");
    const goToMateriaButton = document.getElementById("goToMateria");
  
    // Evento de submissão do formulário de login
    loginForm.onsubmit = async function (e) {
      e.preventDefault();
  
      const email = document.getElementById("Email").value;
      const senha = document.getElementById("Senha").value;
  
      if (!email || !senha) {
        alert("Por favor, preencha todos os campos.");
        return;
      }
  
      const res = await fetch("http://localhost:3000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, senha }),
      });
  
      const data = await res.json();
  
      if (data.resultado === "Login bem-sucedido" && data.tipo === "professor") {
        // Esconde o formulário e mostra o seletor de matéria
        loginForm.style.display = "none";
        materiaSelector.style.display = "block";
        localStorage.setItem("professorData", JSON.stringify(data.professor)); // Armazena os dados do professor
      } else if (data.resultado === "Login bem-sucedido" && data.tipo === "aluno") {
        window.location.href = "./carregamento.html";
      } else {
        alert("Login falhou. Verifique suas credenciais.");
      }
    };
  
    // Evento para redirecionar com base na disciplina selecionada
    goToMateriaButton.onclick = function () {
      const disciplina = disciplinaSelect.value;
      if (!disciplina) {
        alert("Por favor, selecione uma matéria.");
        return;
      }
  
      localStorage.setItem("disciplina", disciplina); // Salva a disciplina no localStorage
      if (disciplina === "matematica") {
        window.location.href = "./pagina-matematica.html";
      } else if (disciplina === "portugues") {
        window.location.href = "./pagina-portugues.html";
      } else {
        alert("Matéria não reconhecida. Verifique suas opções.");
      }
    };
  });
  
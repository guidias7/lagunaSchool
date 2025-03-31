const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const path = require('path');
const fs = require('fs');  



const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// banco de dados
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'matheusmysql1234',
    database: 'mydb',
});

connection.connect((err) => {
    if (err) {
        console.error('Erro ao conectar-se ao banco de dados: ' + err.stack);
        return;
    }
    console.log('Conectado ao banco de dados como ID ' + connection.threadId);
});


const queryDatabase = async (query, params = []) => {
    try {
        const [results] = await connection.promise().execute(query, params);
        return results;
    } catch (error) {
        console.error('Erro ao executar query:', error);
        throw error;
    }
};

// **ENDPOINTS**

app.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        console.log("Erro: Email ou senha ausentes");
        return res.status(400).json({ resultado: 'Email e senha são obrigatórios' });
    }

    try {
        console.log("Tentando logar com email:", email);
        const alunoQuery = `
            SELECT cpf_aluno, nome_aluno, turma_id_turma 
            FROM aluno 
            WHERE email = ? AND senha_aluno = ?;
        `;
        const alunoResults = await queryDatabase(alunoQuery, [email, senha]);

        console.log("Resultado da query para aluno:", alunoResults);

        if (alunoResults.length > 0) {
            const aluno = alunoResults[0];
            return res.json({
                resultado: 'Login bem-sucedido',
                tipo: 'aluno',
                aluno: {
                    id: aluno.cpf_aluno,
                    nome: aluno.nome_aluno,
                    turma_id: aluno.turma_id_turma,
                },
            });
        }

        const professorQuery = `
            SELECT 
                p.cpf_professor,
                p.nome_professor, 
                p.disciplina, 
                p.turma_id_turma 
            FROM professor p 
            WHERE email = ? AND senha_professor = ?;
        `;
        const professorResults = await queryDatabase(professorQuery, [email, senha]);

        if (professorResults.length > 0) {
            const professor = professorResults[0];
            return res.json({
                resultado: 'Login bem-sucedido',
                tipo: 'professor',
                professor: {
                    cpf : professor.cpf_professor,
                    nome: professor.nome_professor,
                    materia: professor.disciplina,  
                    turma: professor.turma_id_turma,
                },
            });
        }
        return res.json({ resultado: 'Login falhou. Verifique suas credenciais.' });
    } catch (error) {
        console.error('Erro ao processar login:', error);
        res.status(500).json({ resultado: 'Erro ao processar login' });
    }
});

app.get('/turmas', async (req, res) => {
    const query = `
        SELECT id_turma, CONCAT(ano, ' - ', nome_turma) AS descricao_turma 
        FROM turma
        ORDER BY ano, nome_turma;
    `;

    try {
        const results = await queryDatabase(query);
        res.json(results);
    } catch (error) {
        res.status(500).json({ resultado: 'Erro ao buscar turmas' });
    }
});


app.get('/entregas', async (req, res) => {
    const { turma, materia, cpf_aluno } = req.query;  

    if (!turma || !materia || !cpf_aluno) {
        return res.status(400).json({ error: 'Turma, matéria e CPF do aluno são obrigatórios' });
    }

    console.log(`Requisitando entregas para a turma ID: ${turma}, matéria: ${materia}, CPF do aluno: ${cpf_aluno}`);

    try {
        
        const verificaTurmaQuery = `
            SELECT 1 
            FROM aluno 
            WHERE cpf_aluno = ? AND turma_id_turma = ?;
        `;
        const [verificacao] = await connection.promise().execute(verificaTurmaQuery, [cpf_aluno, turma]);

        if (verificacao.length === 0) {
            return res.status(403).json({ error: 'Acesso negado. O aluno não pertence a essa turma.' });
        }

        const query = `
            SELECT 
                a.nome_aluno, 
                COUNT(t.id_tarefa) AS tarefasFeitas, 
                (SELECT COUNT(*) FROM tarefas WHERE turma_id_turma = ? AND disciplina = ?) - COUNT(t.id_tarefa) AS tarefasPendentes
            FROM aluno a
            LEFT JOIN tarefas t ON a.id_tarefa_concluida = t.id_tarefa
            WHERE a.turma_id_turma = ?
            GROUP BY a.cpf_aluno;
        `;

        const [rows] = await connection.promise().execute(query, [turma, materia, turma]);

        if (rows.length === 0) {
            console.log(`Nenhuma entrega encontrada para a turma ID: ${turma} e matéria: ${materia}`);
            return res.json([]);  
        }

        console.log(`Entregas encontradas para a turma ${turma} e matéria ${materia}:`, rows);
        return res.json(rows);  
    } catch (err) {
        console.error('Erro ao consultar o banco de dados:', err);
        return res.status(500).json({ error: 'Erro no servidor ao buscar entregas.' });
    }
});




app.get('/tarefas', async (req, res) => {
    const disciplina = req.query.disciplina;  
    const dataEntrega = req.query.data_entrega;

    if (!disciplina) {
        return res.status(400).json({ error: 'Disciplina não definida' });
    }

    let query = `
        SELECT t.id_tarefa, t.titulo, t.descricao, t.data_inicio, t.data_entrega, t.disciplina, 
               t.turma_id_turma, tu.nome_turma, tu.ano
        FROM tarefas t
        INNER JOIN turma tu ON t.turma_id_turma = tu.id_turma
        WHERE t.disciplina = ?`;

    const params = [disciplina];

    if (dataEntrega) {
        query += ' AND t.data_entrega = ?';  
        params.push(dataEntrega);
    }

    try {
        const [rows] = await connection.promise().execute(query, params);

        if (rows.length === 0) {
            return res.json([]);
        }

        return res.json(rows);
    } catch (err) {
        console.error('Erro ao consultar o banco de dados:', err);
        return res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.get('/tarefas-filtradas', async (req, res) => {
    const disciplina = req.query.disciplina;  
    const dataEntrega = req.query.data_entrega;
    const cpf = req.query.cpf;  
    const turmaId = req.query.turma_id;  

    console.log('Requisição recebida com os seguintes parâmetros:');
    console.log('Disciplina:', disciplina);
    console.log('Data de Entrega:', dataEntrega);
    console.log('CPF:', cpf);
    console.log('Turma ID:', turmaId);

    if (!disciplina) {
        return res.status(400).json({ error: 'Disciplina não definida' });
    }

    let query = `
        SELECT t.id_tarefa, t.titulo, t.descricao, t.data_inicio, t.data_entrega, t.disciplina, 
               t.turma_id_turma, tu.nome_turma, tu.ano
        FROM tarefas t
        INNER JOIN turma tu ON t.turma_id_turma = tu.id_turma
        WHERE t.disciplina = ?`;

    const params = [disciplina];

    if (dataEntrega) {
        query += ' AND t.data_entrega = ?'; 
        params.push(dataEntrega);
    }


    if (cpf) {
        query += ' AND EXISTS (SELECT 1 FROM aluno a WHERE a.cpf_aluno = ? AND a.turma_id_turma = tu.id_turma)';
        params.push(cpf); 
    }

   
    if (turmaId && turmaId !== 'null') {
        query += ' AND t.turma_id_turma = ?';  
        params.push(turmaId);
    }

    try {
        console.log("Consulta SQL: ", query);
        console.log("Parâmetros: ", params);
        
        const [rows] = await connection.promise().execute(query, params);

        if (rows.length === 0) {
            return res.json([]);  
        }

        return res.json(rows);  
    } catch (err) {
        console.error('Erro ao consultar o banco de dados:', err);
        return res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});






app.get('/entregas-p', async (req, res) => {
    const turmaId = req.query.turma;  
    if (!turmaId) {
        return res.status(400).json({ error: 'Turma não definida' });
    }

    console.log(`Requisitando entregas para a turma ID: ${turmaId}`);

    try {
        const query = `
            SELECT 
                a.nome_aluno, 
                COUNT(t.id_tarefa) AS tarefasFeitas, 
                (SELECT COUNT(*) FROM tarefas WHERE turma_id_turma = ?) - COUNT(t.id_tarefa) AS tarefasPendentes
            FROM aluno a
            LEFT JOIN tarefas t ON a.id_tarefa_concluida = t.id_tarefa
            WHERE a.turma_id_turma = ?
            GROUP BY a.cpf_aluno;
        `;
        const [rows] = await connection.promise().execute(query, [turmaId, turmaId]);

        if (rows.length === 0) {
            console.log(`Nenhuma entrega encontrada para a turma ID: ${turmaId}`);
            return res.json([]); 
        }

        console.log(`Entregas encontradas para a turma ${turmaId}:`, rows);
        return res.json(rows);  
    } catch (err) {
        console.error('Erro ao consultar o banco de dados:', err);
        return res.status(500).json({ error: 'Erro no servidor' });
    }
});


app.post('/tarefas', async (req, res) => {
    const { turma, materia, datainicio, datatermino, titulo, descricao } = req.body;

    if (!turma || !materia || !datainicio || !datatermino || !titulo || !descricao) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    const query = `
        INSERT INTO tarefas (turma_id_turma, disciplina, data_inicio, data_entrega, titulo, descricao)
        VALUES (?, ?, ?, ?, ?, ?);
    `;

    try {
        const [result] = await connection.promise().execute(query, [
            turma,
            materia,
            datainicio,
            datatermino,
            titulo,
            descricao
        ]);

        res.status(201).json({
            message: 'Tarefa criada com sucesso!',
            id_tarefa: result.insertId,
        });
    } catch (error) {
        console.error('Erro ao criar tarefa:', error);
        res.status(500).json({ error: 'Erro ao criar tarefa no banco de dados.' });
    }
});

//  para alterar a senha do usuário
app.post('/alterar-senha', async (req, res) => {
    try {
      console.log('Requisição recebida para alterar senha');
      const { email, senhaAtual, novaSenha, confirmarSenha, tipoUsuario } = req.body;
  
      console.log(`Dados recebidos: ${email}, ${tipoUsuario}`);
  
      // fverificar se os campos obrigatórios foram fornecidos
      if (!email || !senhaAtual || !novaSenha || !confirmarSenha || !tipoUsuario) {
        console.log('Campos obrigatórios não fornecidos');
        return res.status(400).json({ resultado: 'Todos os campos são obrigatórios' });
      }
  
      if (novaSenha !== confirmarSenha) {
        console.log('As senhas não coincidem');
        return res.status(400).json({ resultado: 'As senhas não coincidem' });
      }
  
      //  atualizar a senha no banco de dados
      let query;
      if (tipoUsuario === 'aluno') {
        query = `
          UPDATE aluno
          SET senha_aluno = ?
          WHERE email = ? AND senha_aluno = ?;
        `;
      } else if (tipoUsuario === 'professor') {
        query = `
          UPDATE professor
          SET senha_professor = ?
          WHERE email = ? AND senha_professor = ?;
        `;
      } else {
        console.log('Tipo de usuário inválido');
        return res.status(400).json({ resultado: 'Tipo de usuário inválido' });
      }
  
      console.log('Executando query:', query);
      const [result] = await connection.promise().execute(query, [novaSenha, email, senhaAtual]);
  
      if (result.affectedRows > 0) {
        console.log('Senha alterada com sucesso');
        return res.json({ resultado: 'Senha alterada com sucesso' });
      } else {
        console.log('Usuário não encontrado ou senha atual incorreta');
        return res.status(404).json({ resultado: 'Usuário não encontrado ou senha atual incorreta' });
      }
    } catch (error) {
      console.error('Erro ao alterar a senha:', error);
      return res.status(500).json({ resultado: 'Erro ao processar a alteração de senha' });
    }
  });
  
  
  app.get('/tarefas', async (req, res) => {
    const disciplina = req.query.disciplina;  L

    if (!disciplina) {
        return res.status(400).json({ error: 'Disciplina não definida' });
    }

    const query = `
        SELECT t.id_tarefa, t.titulo, t.descricao, t.data_inicio, t.data_entrega, t.disciplina, 
               t.turma_id_turma, tu.nome_turma, tu.ano
        FROM tarefas t
        INNER JOIN turma tu ON t.turma_id_turma = tu.id_turma
        WHERE t.disciplina = ?;
    `;
    try {
        const [rows] = await connection.promise().execute(query, [disciplina]);
        if (rows.length === 0) {
            return res.json([]);
        }
        return res.json(rows);
    } catch (err) {
        console.error('Erro ao consultar o banco de dados:', err);
        return res.status(500).json({ error: 'Erro no servidor' });
    }
});


app.put('/tarefas/:id', async (req, res) => {
    const tarefaId = req.params.id;
    const { titulo, descricao, data_entrega } = req.body;

    console.log('tarefaId:', tarefaId);
    console.log('titulo:', titulo);
    console.log('descricao:', descricao);
    console.log('data_entrega:', data_entrega);

    try {
        const query = `
        UPDATE tarefas
        SET titulo = ?, descricao = ?, data_entrega = ?
        WHERE id_tarefa = ?;  
    `;
    
        const values = [titulo, descricao, data_entrega, tarefaId];

        console.log('Query:', query);
        console.log('Values:', values);

        const [result] = await connection.promise().execute(query, values);

        if (result.affectedRows > 0) {
            return res.json({ message: 'Tarefa atualizada com sucesso.' });
        } else {
            return res.status(404).json({ error: 'Tarefa não encontrada.' });
        }
    } catch (error) {
        console.error('Erro ao atualizar tarefa:', error);
        return res.status(500).json({ error: 'Erro ao atualizar tarefa no banco de dados.', details: error.message });
    }
});


app.delete('/tarefas/:id', async (req, res) => {
    const { id } = req.params;

    const query = `DELETE FROM tarefas WHERE id_tarefa = ?`;

    try {
        const [result] = await connection.promise().execute(query, [id]);

        if (result.affectedRows > 0) {
            return res.json({ message: 'Tarefa excluída com sucesso' });
        } else {
            return res.status(404).json({ error: 'Tarefa não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao excluir tarefa:', error);
        return res.status(500).json({ error: 'Erro ao excluir tarefa' });
    }
});

app.get('/tarefas/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await connection.promise().execute('SELECT * FROM tarefas WHERE id_tarefa = ?', [id]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Tarefa não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao buscar tarefa:', error);
        res.status(500).json({ error: 'Erro ao buscar tarefa' });
    }
});

app.get('/tarefas/:id', async (req, res) => {
    const id = req.params.id;

    try {
        const [rows] = await connection.promise().query('SELECT * FROM tarefas WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Atividade não encontrada.' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Erro ao buscar atividade:', error);
        res.status(500).json({ error: 'Erro ao buscar atividade no banco de dados.' });
    }
});


app.get('/tarefas', async (req, res) => {
    const disciplina = req.query.materia;  

    if (!disciplina) {
        return res.status(400).json({ error: 'Disciplina não definida' });
    }

    const query = `
        SELECT t.id_tarefa, t.titulo, t.descricao, t.data_inicio, t.data_entrega, t.disciplina, 
               t.turma_id_turma, tu.nome_turma, tu.ano
        FROM tarefas t
        INNER JOIN turma tu ON t.turma_id_turma = tu.id_turma
        WHERE t.disciplina = ?;
    `;
    try {
        const [rows] = await connection.promise().execute(query, [disciplina]);
        if (rows.length === 0) {
            return res.json([]);
        }
        return res.json(rows);
    } catch (err) {
        console.error('Erro ao consultar o banco de dados:', err);
        return res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.get('/tarefas/aluno', async (req, res) => {
    const { cpf_aluno, turma_id_turma } = req.query;

    if (!cpf_aluno || !turma_id_turma) {
        return res.status(400).json({ error: 'CPF do aluno e ID da turma são obrigatórios' });
    }

    try {
        
        const verificaTurmaQuery = `
            SELECT 1 
            FROM aluno 
            WHERE cpf_aluno = ? AND turma_id_turma = ?;
        `;
        const [verificacao] = await connection.promise().execute(verificaTurmaQuery, [cpf_aluno, turma_id_turma]);

        if (verificacao.length === 0) {
            return res.status(403).json({ error: 'Acesso negado. O aluno não pertence a essa turma.' });
        }

       
        const query = `
            SELECT t.id_tarefa, t.titulo, t.descricao, t.data_inicio, t.data_entrega, t.disciplina, 
                   t.turma_id_turma, tu.nome_turma, tu.ano
            FROM tarefas t
            INNER JOIN turma tu ON t.turma_id_turma = tu.id_turma
            WHERE t.turma_id_turma = ? AND t.disciplina IN (
                SELECT disciplina
                FROM aluno_disciplina
                WHERE cpf_aluno = ?
            );
        `;

        console.log(`Recebido CPF do aluno: ${cpf_aluno}`);
        console.log(`Recebido ID da turma: ${turma_id_turma}`);

        const [rows] = await connection.promise().execute(query, [turma_id_turma, cpf_aluno]);

        if (rows.length === 0) {
            return res.json([]);
        }

        return res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar tarefas do aluno:', error);
        return res.status(500).json({ error: 'Erro no servidor' });
    }
});


app.get('/tarefas', async (req, res) => {
    const { disciplina, turma_id } = req.query;
    try {
       
        if (!disciplina || !turma_id) {
            return res.status(400).json({ error: "Parâmetros de disciplina e turma_id são obrigatórios." });
        }

        const tarefas = await db.query('SELECT * FROM tarefas WHERE disciplina = ? AND turma_id = ?', [disciplina, turma_id]);

        res.status(200).json(tarefas);
    } catch (error) {
        console.error("Erro ao buscar tarefas:", error);
        res.status(500).json({ error: "Erro interno do servidor." });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads'); 
    },
    filename: (req, file, cb) => {
       
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); 
    }
});

const uploads = multer({ storage: storage });
app.post('/enviar-arquivos', upload.array('files[]', 10), async (req, res) => {
    if (req.files) {
        const { cpf_aluno, id_tarefa } = req.body; 

        if (!cpf_aluno || !id_tarefa) {
            return res.status(400).json({ error: 'CPF do aluno e ID da tarefa são obrigatórios.' });
        }

        try {
            
            const query = `
                INSERT INTO tarefas_concluidas (cpf_aluno, id_tarefa, arquivo)
                VALUES (?, ?, ?);
            `;

            
            for (const file of req.files) {
                await connection.promise().execute(query, [cpf_aluno, id_tarefa, file.filename]); // Salva o nome do arquivo
            }

            console.log('Arquivos recebidos:', req.files);
            res.status(200).json({ message: 'Arquivos enviados e dados registrados com sucesso!' });
        } catch (error) {
            console.error('Erro ao registrar dados na tabela tarefas_concluidas:', error);
            res.status(500).json({ error: 'Erro ao registrar tarefa concluída no banco de dados.' });
        }
    } else {
        res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
    }
});






app.get('/tarefas', async (req, res) => {
    const { disciplina, cpf } = req.query;
    try {
        console.log(`Buscando tarefas para a disciplina: ${disciplina} e CPF: ${cpf}`);

       
        const tarefas = await db.query(`
            SELECT t.id_tarefa, t.titulo, t.descricao, t.data_entrega, 
            (CASE WHEN tc.id_tarefa IS NOT NULL THEN 1 ELSE 0 END) AS concluida
            FROM tarefas t
            LEFT JOIN tarefas_concluidas tc ON t.id_tarefa = tc.id_tarefa
            WHERE t.disciplina = ? AND t.cpf_aluno = ?`, [disciplina, cpf]);

        console.log("Tarefas obtidas do banco de dados:", tarefas); 

        res.json(tarefas);
    } catch (error) {
        console.error("Erro ao buscar tarefas:", error);
        res.status(500).send("Erro ao buscar tarefas.");
    }
});






app.get('/atividades', (req, res) => {
    const sql = 'SELECT * FROM atividades';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Erro ao buscar atividades:', err);
            res.status(500).json({ error: 'Erro ao buscar atividades' });
            return;
        }
        res.json(results); 
    });
});


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.get('/files', async (req, res) => {
    const { aluno, materia } = req.query; 
    
    const folderPath = path.join(__dirname, 'uploads');
    
    if (!fs.existsSync(folderPath)) {
        console.error('Pasta "uploads" não encontrada');
        return res.status(500).json({ success: false, message: 'Pasta "uploads" não encontrada' });
    }

    try {
        const [tasks] = await connection.promise().query(`
            SELECT 
                t.id_tarefa,
                t.titulo AS tarefa,
                t.data_entrega,
                t.disciplina,  -- Incluindo a disciplina na consulta
                tc.arquivo AS arquivo
            FROM tarefas t
            LEFT JOIN tarefas_concluidas tc ON t.id_tarefa = tc.id_tarefa
            LEFT JOIN professor p ON t.disciplina = p.disciplina  -- Garantindo que estamos pegando o professor correto
            WHERE tc.arquivo IS NOT NULL
            AND t.disciplina = ?  -- Filtro pela disciplina
        `, [materia]); 

        const tasksData = tasks.map(task => {
            const filePath = path.join(folderPath, task.arquivo);
            const exists = fs.existsSync(filePath); 
            return {
                tarefa: task.tarefa,
                data_entrega: task.data_entrega,
                arquivo: task.arquivo,
                exists: exists
            };
        });

        res.json(tasksData); 
    } catch (error) {
        console.error('Erro ao buscar tarefas:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar tarefas' });
    }
});




app.get('/tarefas-concluidas', async (req, res) => {
    const { cpf_professor } = req.query;
    console.log('CPF do Professor recebido na requisição:', cpf_professor); 
    
    const query = `
        SELECT 
            t.titulo AS tarefa,
            t.descricao,
            t.data_entrega,
            a.nome_aluno,
            p.nome_professor
        FROM 
            tarefas_concluidas tc
        JOIN 
            tarefas t ON tc.id_tarefa = t.id_tarefa
        JOIN 
            aluno a ON tc.cpf_aluno = a.cpf_aluno
        JOIN 
            professor p ON a.turma_id_turma = p.turma_id_turma
        WHERE 
            p.cpf_professor = ? 
        ORDER BY 
            t.data_entrega DESC;
    `;

    try {
        const [result] = await connection.promise().execute(query, [cpf_professor]);
        console.log('Resultado da consulta:', result); 
        res.json(result);
    } catch (error) {
        console.error('Erro ao consultar tarefas:', error);
        res.status(500).json({ error: 'Erro ao consultar tarefas concluídas' });
    }
});




app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});

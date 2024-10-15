window.onload = () => checkUser();
let user = null;
let userId = null;
let currentFileName = "";
let currentFileId = "";
let isPublic = false;
const runBtn = document.getElementById("runBtn");
const params = new URLSearchParams(window.location.search);
const codeSection = document.getElementById("codeSection");

async function checkUser() {
    try {
        const response = await fetch('/mycompiler/login');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'success') {
            runBtn.disabled = false;
            user = data.user.username;
            userId = sessionStorage.getItem('userId');
            let username = document.getElementById('username');
            username.innerText += (' ' + user);
            currentFileId = params.get("id");
            currentFileName = params.get("filename");
            isPublic = params.get('publicFile') === 'true';
            if(isPublic)
                codeSection.contentEditable = false;
            const fileName = document.getElementById("displayFileName");
            fileName.innerText = currentFileName;
            getSingleFileDetails(currentFileId, currentFileName, true, isPublic);
        } else {
            console.log(data.message);
        }

        if (data.status !== 'success') {
            window.location.href = '/mycompiler/index.html';
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
    }
}


async function handleSignOut() {
    const response = await fetch("/mycompiler/logout", {
        method: 'POST'
    });
    window.location.href = "/mycompiler/index.html";
}

let id = null;
// get current sessionID
async function getsession() {
    const response = await fetch("/mycompiler/getSession");
    const result = (await response.text()).trim();
    id = result;
}

// start websocket
let socket = null;
let printfStmt = '';
async function initWebSocket() {
    await getsession();
    socket = new WebSocket(`ws://localhost:8080/mycompiler/output?sessionId=${id}`);

    socket.onopen = function () {
        console.log("WebSocket connection established.");
    };

    socket.onmessage = function (event) {
        if (event.data.indexOf("Execution time") >= 0) {
            const status = document.getElementById("compilationStatus");
            status.innerText = event.data;
            document.getElementById("inner-text-area").placeholder = "";
            return;
        }
        if (event.data.indexOf("Memory usage") >= 0) {
            const status = document.getElementById("memory");
            status.innerText = event.data;
            return;
        }
        // if (event.data.startsWith("File")) {
        //     const fileDetails = event.data.replace("File", "").trim().split(":");
        //     const fileName = fileDetails[0];
        //     const fileId = fileDetails[1];
        //     const FileList = document.getElementById("fileList");
        //     const list = document.createElement("li");
        //     list.innerText = fileName;
        //     list.onclick = () => getSingleFileDetails(fileId, fileName, true);
        //     FileList.appendChild(list);
        //     return;
        // }
        if (event.data.indexOf('running') >= 0) {
            document.getElementById("inner-text-area").placeholder = "Running...";
            return;
        }
        const resultDiv = document.getElementById("inner-text-area");
        resultDiv.value += event.data;
        resultDiv.focus();
        // resultDiv.scrollTop = resultDiv.scrollHeight;
        printfStmt += event.data;
        runBtn.disabled = false;
        if (event.data.indexOf('Exited with') >= 0) {
            const outer = document.getElementById('result');
            const inner = document.getElementById('inner-text-area');

            if (inner.value.trim() !== '') {
                outer.value += inner.value;
            }
            inner.value = '';
            outer.style.display = 'block';
            inner.style.borderTop = 'none';
            inner.style.paddingTop = '0px';
            outer.style.height = 'auto';
            outer.style.height = Math.min(outer.scrollHeight, 300) + 'px';
            outer.scrollTop = outer.scrollHeight;
            const innerHeight = Math.max(50, 300 - outer.offsetHeight);
            inner.style.height = innerHeight + 'px';
        }
        document.getElementById('customResult').innerText = '';
        document.getElementById('cr').style.display = 'none';
        document.getElementById('customSection').style.height = '25rem';
    };

    socket.onclose = function () {
        console.log("WebSocket connection closed.");
    };

    socket.onerror = function (error) {
        console.error("WebSocket error:", error);
    };
}

// Initialize the WebSocket connection
initWebSocket();

// function to get a selected file from DB
async function getSingleFileDetails(fileId, fileName, bool, isPublic) {
    currentFileName = fileName;
    currentFileId = fileId;
    const response = await fetch(`/mycompiler/getSingleFile?fileId=${encodeURIComponent(fileId)}&userId=${encodeURIComponent(userId)}&public=${encodeURIComponent(isPublic)}`);
    const result = (await response.text()).split("$%^");
    console.log(result);
    if(result[0].includes('UnAuthorized')){
        alert("There is no such File Exists :(");
        window.history.back();
        return;
    }
    if(result[3] && result[3] === userId){
        codeSection.contentEditable = true;
    }
    codeSection.innerText = result[0];
    highlightKeywords();
    const bestComp = document.getElementById("bestCompilation");
    const bestMem = document.getElementById("bestMemory");
    const comp = document.getElementById("compilationStatus");
    const mem = document.getElementById("memory");
    bestComp.innerHTML = "";
    bestMem.innerHTML = "";
    if (bool) {
        comp.innerHTML = "";
        mem.innerHTML = "";
    }
    bestComp.innerHTML = "Best Execution Time <br><hr><br>" + (result[1] === "0.0" ? "Nil" : result[1] + "s");
    bestMem.innerHTML = "Best Memory Usage <br><hr><br>" + (result[2] === "0" ? "Nil" : result[2]);
    const displayName = document.getElementById("displayFileName");
    displayName.innerText = fileName;
};
const innerValue = document.getElementById('inner-text-area').value;
// section to parse and send the user input to the sender function
document.getElementById("inner-text-area").addEventListener("keydown", function (event) {

    if (event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('inner-text-area').placeholder = '';

        const resultArea = document.getElementById("inner-text-area");
        let inputValue = resultArea.value.trim();
        printfStmt = printfStmt.trim();
        inputValue = inputValue.replaceAll('\n', '').replaceAll('\r', '');
        printfStmt = printfStmt.replaceAll('\n', '').replaceAll('\r', '');
        console.log(inputValue)
        console.log(printfStmt)
        inputValue = inputValue.replace(printfStmt, "");
        let lastLine = inputValue.substring(inputValue.lastIndexOf('\n') + 1);
        lastLine = lastLine.replace(printfStmt, "");
        printfStmt = '';
        sendToServlet(lastLine.trim());
        resultArea.value += '\n';
        handleEnter(event);
    }
});

// function to send input to the servlet
async function sendToServlet(line) {

    if (line.trim() === "") return;
    const response = await fetch('/mycompiler/input', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            line: line
        }).toString()
    });
}

// main function to send a file to servlet
// function handleCustomInput(event) {
//     const customSec = document.getElementById('customSection');
//     setTimeout(() => {
//         if (customSec.value.length === 0) {
//             document.getElementById('runCustomBtn').disabled = true;
//         } else {
//             document.getElementById('runCustomBtn').disabled = false;
//         }
//     }, 0);

//     if (event.key === 'Backspace') {
//         setTimeout(() => {
//             if (customSec.value.length === 0) {
//                 document.getElementById('runCustomBtn').disabled = true;
//             } else {
//                 document.getElementById('runCustomBtn').disabled = false;
//             }
//         }, 0)
//     }
// }

//function to send the code to backend
async function compile() {
    printfStmt = '';
    const outer = document.getElementById('result');
    const compiledResult = document.getElementById("inner-text-area");
    outer.style.display = 'none';
    compiledResult.style.borderTop = '1px solid white';
    compiledResult.style.paddingTop = '1rem';
    let innerHeight = '300';
    if (outer.style.display === 'block')
        innerHeight = Math.max(50, 300 - outer.offsetHeight);
    compiledResult.style.height = innerHeight + 'px';

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert("WebSocket disconnected. Kindly refresh the page.");
        location.reload();
        return;
    }
    document.getElementById('result').value = '';

    const content = document.getElementById("codeSection").innerText;
    compiledResult.value = "";
    const name = document.getElementById("displayFileName").innerText;

    compiledResult.placeholder = "compiling...";
    runBtn.disabled = true;
    const response = await fetch('/mycompiler/compiler', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            cProgram: content,
            fileName: name
        }).toString()
    });
    if (response.status != 200) {
        runBtn.disabled = false;
        document.getElementById("compilationStatus").innerText = "";
        document.getElementById("memory").innerText = "";
    } else {
        compiledResult.placeholder = "";
        getSingleFileDetails(currentFileId, currentFileName, false, isPublic);
    }
}
let unUsedVariables = '';
//modify the actual code to custom values
function customizeVariables(input) {
    const codeSection = document.getElementById("codeSection");
    const cProg = codeSection.innerText;
    const customSec = input;
    const customVar = customSec;
    const objectArray = customVar.split(/[;]+/).map(arr => {
        if (arr.length >= 1)
            return {
                stmt: arr.trim().split(/[=]+/).map(word => word.trim()),
                modified: false
            };
    });
    // console.log(objectArray)
    let cProgArray = cProg.split(/[\n]+/);
    let regexArray = [];

    for (const obj of objectArray) {
        if (obj) {
            if(obj.stmt[0].includes('[')){
                const a1 = obj.stmt[0].split('[');
                a1[0] = a1[0] + '\\';
                const a2 = a1[1].split(']');
                a2[0] = a2[0] + '\\';
                a1[1] = a2.join(']');
                obj.stmt[0] = a1.join('[');
            }
            const regex = new RegExp(`(?<!//.*)${obj.stmt[0]}\\s*=`);
            regexArray.push(regex);
        }
    }
    cProgArray = cProgArray.map(line => {
        if (!line.trim().startsWith('//')) {
            const matchedIndex = regexArray.findIndex(regex => regex.test(line.trim()));

            if (matchedIndex !== -1 && !objectArray[matchedIndex].modified) {
                const array = line.split('=');
                const newValue = objectArray[matchedIndex].stmt[1];
                objectArray[matchedIndex].modified = true;
                if (newValue) {
                    if (array[0].includes('string')) {
                        if (array[0].includes('['))
                            array[1] = addQuotes(newValue, 'string') + ';';
                        else
                            array[1] = '\"' + newValue + '\";';
                    }
                    else if (array[0].includes('char')) {
                        if (array[0].includes('['))
                            array[1] = addQuotes(newValue, 'char') + ';';
                        else
                            array[1] = '\"' + newValue + '\";';
                    } else {
                        const subArray = array[1].split(';');
                        subArray[0] = newValue;
                        array[1] = subArray.join(';');
                    }
                }
                return array.join('=');
            }
        }
        return line;
    });
    
    
    let inputString = '';
    
    for (let line of cProgArray) {
        line = line.replace(' ', '');
        if (line.includes('scanf') || line.includes('cin')) {
            const stmts = line.split(';');
            if (stmts.length >= 3) {
                for (const stmt of stmts) {
                    if (!stmt.trim().startsWith('//')) {
                        if (stmt.includes('scanf')) {
                            let index = 0;
                            while ((index = stmt.indexOf('&', index)) >= 0) {
                                let endIndex = index + 1;
                                while (endIndex < stmt.length && stmt[endIndex] !== ',' && stmt[endIndex] !== ')') {
                                    endIndex++;
                                }
                                let variable = stmt.substring(index + 1, endIndex).trim();
                                const result = checkInObjArray(variable, objectArray);
                                allSuggestions.unshift(variable);
                                if (result.boolean) {
                                    inputString += (result.value + '\n');
                                } else {
                                    unUsedVariables += variable + ' ';
                                }
                                index++;
                            }
                        } else {
                            let index = 0;
                            while ((index = stmt.indexOf('>>', index)) >= 0) {
                                let endIndex = index + 2;
                                while (endIndex < stmt.length && stmt[endIndex] !== ';' && !(stmt[endIndex] === '>' && (endIndex + 1 < stmt.length) ? stmt[endIndex + 1] === '>' : false)) {
                                    endIndex++;
                                }
                                let variable = stmt.substring(index + 2, endIndex).trim();
                                const result = checkInObjArray(variable, objectArray);
                                allSuggestions.unshift(variable);
                                if (result.boolean) {
                                    inputString += (result.value + '\n');
                                } else {
                                    unUsedVariables += variable + ' ';
                                }
                                index++;
                            }
                        }
                    }
                }
            } else {
                if (!line.trim().startsWith('//')) {
                    if (line.includes('scanf')) {
                        let index = 0;
                        while ((index = line.indexOf('&', index)) >= 0) {
                            let endIndex = index + 1;
                            let delimiterFound = false;
                            while (!delimiterFound && endIndex < line.length) {
                                if (line[endIndex] === ',' || line[endIndex] === ')') {
                                    delimiterFound = true;
                                } else {
                                    endIndex++;
                                }
                            }
                            if (delimiterFound) {
                                let variable = line.substring(index + 1, endIndex).trim();
                                const result = checkInObjArray(variable, objectArray);
                                allSuggestions.unshift(variable);
                                if (result.boolean) {
                                    inputString += (result.value + '\n');
                                } else {
                                    unUsedVariables += variable + ' ';
                                }
                            }
                            index++;
                        }
                    } else {
                        let index = 0;
                        while ((index = line.indexOf('>>', index)) >= 0) {
                            let endIndex = index + 2;
                            let delimiterFound = false;
                            while (!delimiterFound && endIndex < line.length) {
                                if ((line[endIndex] === '>' && (endIndex + 1 < line.length) ? line[endIndex + 1] === '>' : false) || line[endIndex] === ';') {
                                    delimiterFound = true;
                                } else {
                                    endIndex++;
                                }
                            }
                            if (delimiterFound) {
                                let variable = line.substring(index + 2, endIndex).trim();
                                const result = checkInObjArray(variable, objectArray);
                                allSuggestions.unshift(variable);
                                if (result.boolean) {
                                    inputString += (result.value + '\n');
                                } else {
                                    unUsedVariables += variable + ' ';
                                }
                            }
                            index++;
                        }
                    }
                }

            }
        }
    }
    return {
        is: inputString,
        prog: cProgArray.join('\n')
    }
}

function addQuotes(value,type){
    const quote = (type === 'string') ? '"' : "'";
    let array = value.replace('{','').replace('}','').split(',');
    for(let i=0;i<array.length;i++){
        array[i] = quote + array[i] + quote;
    }
    array[0] = '{' + array[0];
    array[array.length - 1] = array[array.length - 1] + '}';

    return array.join(',');
}
function checkInObjArray(variable, objArray) {
    for (const obj of objArray) {
        if (obj && obj.stmt[0] === variable && !obj.modified) {
            return {
                boolean: true,
                value: obj.stmt[1]
            };
        }
    }

    return {
        boolean: false
    }
}

//check is that new value is a number
function isNumber(str) {
    const regex = /^-?\d+(\.\d+)?$/;
    return regex.test(str);
}

// function handleEnter() {
//     const outer = document.getElementById('result');
//     const inner = document.getElementById('inner-text-area');
//     if (event.key === 'Enter') {
//         if (inner.value !== '\n')
//             outer.value += inner.value;
//         inner.value = '';
//         outer.style.display = 'block';
//         outer.style.height = outer.scrollHeight;
//         outer.scrollTop = outer.scrollHeight;
//     }
// }

function handleEnter(event) {
    const outer = document.getElementById('result');
    const inner = document.getElementById('inner-text-area');

    if (event.key === 'Enter') {
        event.preventDefault();
        if (inner.value.trim() !== '') {
            outer.value += inner.value;
        }
        inner.value = '';
        outer.style.display = 'block';
        inner.style.borderTop = 'none';
        inner.style.paddingTop = '0px';
        outer.style.height = 'auto';
        outer.style.height = Math.min((300 - inner.offsetHeight) <= 0 ? 80 : 300 - inner.offsetHeight, 80) + 'px';
        outer.scrollTop = outer.scrollHeight;
        let innerHeight = '300';
        if (outer.style.display === 'block')
            innerHeight = Math.max(50, inner.offsetHeight);
        inner.style.height = innerHeight + 'px';
        inner.focus();
    }
}

async function customCompile() {
    if(document.getElementById('customSection').value === ''){
        alert('Custom Inputs are Empty!');
        return;
    }
    document.getElementById('result').value = '';
    document.getElementById('inner-text-area').value = '';
    document.getElementById('customSection').style.height = '10rem';
    document.getElementById('cr').style.display = 'none';
    const customInputs = document.getElementById('customSection').value.split('\n');
    let output = 'Case 1:\n';
    const processSec = document.getElementById('processing');
    processSec.style.display = 'block';
    const n = customInputs.length;
    for (let i = 0; i < n; i++) {
        unUsedVariables = '';
        processSec.innerText = `Processing ${i + 1}/${n}...`;
        const customProgramObj = customizeVariables(customInputs[i]);
        if (!customInputs[i] || customInputs[i].trim() === '') {
            output += 'Insuficient Input\nMissing Inputs for ' + unUsedVariables;
            if (i + 2 <= n) {
                output += `\n\nCase ${i + 2}:\n`;
            }
            continue;
        }
        const name = document.getElementById("displayFileName").innerText;
        if (unUsedVariables !== '') {
            output += 'Insuficient Input\nMissing Inputs for ' + unUsedVariables;
            if (i + 2 <= n) {
                output += `\n\nCase ${i + 2}:\n`;
            }
            continue;
        }

        const response = await fetch('/mycompiler/customCompiler', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                fileName: name,
                customCprogram: customProgramObj?.prog,
                input: customProgramObj?.is
                // cProg: content
            }).toString()
        });
        if (response.status != 200) {
            output += 'Invalid Input';
        } else {
            output += await response.text();
        }
        if (i + 2 <= n) {
            output += `\n\nCase ${i + 2}:\n`;
        }
    }
    // console.log(output);
    processSec.style.display = 'none';
    document.getElementById('customResult').innerText = output;
    document.getElementById('cr').style.display = 'block';
}

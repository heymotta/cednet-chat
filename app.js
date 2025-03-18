// Common emojis for reactions
const commonEmojis = ['👍', '❤️', '😄', '😮', '😢', '👏', '🎉', '🤔', '✅', '❌'];

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize emoji picker
    initEmojiPicker();
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.emoji-picker') && !e.target.closest('.reaction-button')) {
            hideEmojiPicker();
        }
    });
    console.log('DOM fully loaded');
    
    // User settings variables
    let currentUserStatus = 'online';
    
    // Local database setup using IndexedDB
    let db;
    const DB_NAME = 'cedNetChatDB';
    const DB_VERSION = 1;
    const USERS_STORE = 'users';
    
    // Initialize the database
    try {
        await initDatabase();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        alert('Erro ao inicializar o banco de dados. Por favor, recarregue a página.');
    }
    // DOM Elements
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    const loginButton = document.getElementById('login-button');
    const registerUsername = document.getElementById('register-username');
    const registerEmail = document.getElementById('register-email');
    const registerPassword = document.getElementById('register-password');
    const registerButton = document.getElementById('register-button');
    const profilePictureInput = document.getElementById('profile-picture');
    const profilePreview = document.getElementById('profile-preview');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const authForms = document.querySelectorAll('.auth-form');
    const currentUserDisplay = document.getElementById('current-user');
    const currentChannelDisplay = document.getElementById('current-channel');
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const channelElements = document.querySelectorAll('.channel');
    
    // Variables
    let currentUser = null;
    let currentChannel = 'geral';
    let socket;
    let activeSubchat = null; // Track active subchat
    let activeEmojiPicker = null; // Track active emoji picker
    
    // Initialize emoji picker
    function initEmojiPicker() {
        const emojiPicker = document.getElementById('emoji-picker');
        commonEmojis.forEach(emoji => {
            const emojiOption = document.createElement('div');
            emojiOption.className = 'emoji-option';
            emojiOption.textContent = emoji;
            emojiOption.addEventListener('click', () => handleEmojiSelect(emoji));
            emojiPicker.appendChild(emojiOption);
        });
    }

    // Handle emoji selection
    function handleEmojiSelect(emoji) {
        if (activeEmojiPicker) {
            const messageId = activeEmojiPicker.getAttribute('data-message-id');
            socket.emit('add_reaction', {
                messageId,
                emoji,
                userId: currentUser.email,
                username: currentUser.username
            });
            hideEmojiPicker();
        }
    }

    // Show emoji picker
    function showEmojiPicker(messageElement, messageId) {
        const emojiPicker = document.getElementById('emoji-picker');
        const rect = messageElement.getBoundingClientRect();
        
        emojiPicker.style.left = `${rect.left}px`;
        emojiPicker.style.bottom = `${window.innerHeight - rect.top + 10}px`;
        emojiPicker.setAttribute('data-message-id', messageId);
        emojiPicker.classList.add('active');
        activeEmojiPicker = emojiPicker;
    }

    // Hide emoji picker
    function hideEmojiPicker() {
        const emojiPicker = document.getElementById('emoji-picker');
        emojiPicker.classList.remove('active');
        activeEmojiPicker = null;
    }

    // Update reactions display
    function updateReactions(messageElement, reactions) {
        const reactionsContainer = messageElement.querySelector('.message-reactions');
        if (!reactionsContainer) return;
        
        reactionsContainer.innerHTML = '';
        const reactionCounts = {};
        
        reactions.forEach(reaction => {
            if (!reactionCounts[reaction.emoji]) {
                reactionCounts[reaction.emoji] = {
                    count: 0,
                    users: []
                };
            }
            reactionCounts[reaction.emoji].count++;
            reactionCounts[reaction.emoji].users.push(reaction.username);
        });
        
        Object.entries(reactionCounts).forEach(([emoji, data]) => {
            const reactionElement = document.createElement('div');
            reactionElement.className = 'reaction';
            reactionElement.innerHTML = `${emoji} <span class="reaction-count">${data.count}</span>`;
            reactionElement.title = `${data.users.join(', ')}`;
            reactionsContainer.appendChild(reactionElement);
        });
    }

    // Notification tracking
    const unreadCounts = {
        channels: {
            geral: 0,
            tecnico: 0,
            comercial: 0,
            interno: 0
        },
        directMessages: {}
    };

    // Update notification badge for channels
    function updateChannelNotification(channel) {
        const badge = document.querySelector(`.channel[data-channel="${channel}"] .notification-badge`);
        if (badge) {
            badge.textContent = unreadCounts.channels[channel];
            badge.classList.toggle('active', unreadCounts.channels[channel] > 0);
        }
    }

    // Update notification badge for direct messages
    function updateDirectMessageNotification(userId) {
        const badge = document.querySelector(`.direct-message[data-user="${userId}"] .notification-badge`);
        if (badge && unreadCounts.directMessages[userId]) {
            badge.textContent = unreadCounts.directMessages[userId];
            badge.classList.toggle('active', unreadCounts.directMessages[userId] > 0);
        }
    }
    
    // User settings elements
    const userProfileHeader = document.getElementById('user-profile-header');
    const userSettingsDropdown = document.getElementById('user-settings-dropdown');
    const userAvatarSmall = document.getElementById('user-avatar-small');
    const settingsUsername = document.getElementById('settings-username');
    const statusOptions = document.querySelectorAll('.status-option');
    const settingsProfilePicture = document.getElementById('settings-profile-picture');
    const settingsProfilePreview = document.getElementById('settings-profile-preview');
    const saveSettingsButton = document.getElementById('save-settings-button');
    
    // Message history for each channel (session only)
    const messageHistory = {
        geral: [],
        tecnico: [],
        comercial: [],
        interno: []
    };
    
    // Subchat history for messages (session only)
    const subchatHistory = {};
    
    // Initialize the database
    function initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject('Erro ao abrir o banco de dados');
            };
            
            request.onsuccess = (event) => {
                db = event.target.result;
                console.log('Database opened successfully');
                resolve(db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create users object store
                if (!db.objectStoreNames.contains(USERS_STORE)) {
                    const usersStore = db.createObjectStore(USERS_STORE, { keyPath: 'email' });
                    usersStore.createIndex('username', 'username', { unique: true });
                    console.log('Users store created');
                }
            };
        });
    }
    
    // Get all users from the database
    function getAllUsers() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([USERS_STORE], 'readonly');
            const usersStore = transaction.objectStore(USERS_STORE);
            const request = usersStore.getAll();
            
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('Error getting users:', event.target.error);
                reject('Erro ao buscar usuários');
            };
        });
    }
    
    // Add a user to the database
    function addUser(user) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([USERS_STORE], 'readwrite');
            const usersStore = transaction.objectStore(USERS_STORE);
            
            // Check if user already exists
            const getUserRequest = usersStore.get(user.email);
            
            getUserRequest.onsuccess = (event) => {
                if (event.target.result) {
                    reject('Este email já está cadastrado');
                    return;
                }
                
                // Add the user
                const addRequest = usersStore.add(user);
                
                addRequest.onsuccess = () => {
                    resolve('Usuário cadastrado com sucesso');
                };
                
                addRequest.onerror = (event) => {
                    console.error('Error adding user:', event.target.error);
                    reject('Erro ao cadastrar usuário');
                };
            };
            
            getUserRequest.onerror = (event) => {
                console.error('Error checking user:', event.target.error);
                reject('Erro ao verificar usuário');
            };
        });
    }
    
    // Get a user from the database
    function getUser(email) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([USERS_STORE], 'readonly');
            const usersStore = transaction.objectStore(USERS_STORE);
            const request = usersStore.get(email);
            
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('Error getting user:', event.target.error);
                reject('Erro ao buscar usuário');
            };
        });
    }
    
    // Tab switching functionality
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show the selected form
            authForms.forEach(form => {
                if (form.id === `${tabName}-tab`) {
                    form.classList.add('active');
                } else {
                    form.classList.remove('active');
                }
            });
        });
    });
    
    // Profile picture preview
    if (profilePictureInput && profilePreview) {
        profilePictureInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Clear the preview and add the image
                    profilePreview.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    profilePreview.appendChild(img);
                };
                reader.readAsDataURL(file);
            }
        });
    } else {
        console.error('Profile picture input or preview not found');
    }
    
    // Register functionality
    if (registerButton) {
        registerButton.addEventListener('click', handleRegister);
    } else {
        console.error('Register button not found');
    }
    
    async function handleRegister() {
        const username = registerUsername.value.trim();
        const email = registerEmail.value.trim();
        const password = registerPassword.value.trim();
        
        // Simple validation
        if (!username || !email || !password) {
            alert('Por favor, preencha todos os campos');
            return;
        }
        
        if (!validateEmail(email)) {
            alert('Por favor, insira um email válido');
            return;
        }
        
        if (password.length < 6) {
            alert('A senha deve ter pelo menos 6 caracteres');
            return;
        }
        
        // Get profile picture if selected
        let profilePicture = null;
        if (profilePictureInput.files.length > 0) {
            const file = profilePictureInput.files[0];
            profilePicture = await readFileAsDataURL(file);
        }
        
        // Create user object
        const user = {
            username,
            email,
            password, // In a real app, this should be hashed
            profilePicture,
            createdAt: new Date().toISOString()
        };
        
        try {
            await addUser(user);
            alert('Cadastro realizado com sucesso! Faça login para continuar.');
            
            // Clear form and switch to login tab
            registerUsername.value = '';
            registerEmail.value = '';
            registerPassword.value = '';
            profilePreview.innerHTML = '<i class="fas fa-user"></i>';
            profilePictureInput.value = '';
            
            // Switch to login tab
            tabButtons[0].click();
        } catch (error) {
            alert(error);
        }
    }
    
    // Login functionality
    if (loginButton) {
        loginButton.addEventListener('click', handleLogin);
    } else {
        console.error('Login button not found');
    }
    
    if (loginPassword) {
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    } else {
        console.error('Login password input not found');
    }
    
    async function handleLogin() {
        const email = loginEmail.value.trim();
        const password = loginPassword.value.trim();
        
        // Simple validation
        if (!email || !password) {
            alert('Por favor, preencha todos os campos');
            return;
        }
        
        try {
            const user = await getUser(email);
            
            if (!user) {
                alert('Email não encontrado');
                return;
            }
            
            if (user.password !== password) { // In a real app, this should be hashed
                alert('Senha incorreta');
                return;
            }
            
            // Set current user
            currentUser = user;
            
            // Connect to WebSocket server
            connectToServer();
            
            // Update UI
            currentUserDisplay.textContent = user.username;
            loginScreen.classList.add('hidden');
            chatScreen.classList.remove('hidden');
            messageInput.focus();
            
            // Initialize user settings
            initUserSettings(user);
        } catch (error) {
            alert('Erro ao fazer login: ' + error);
        }
    }
    
    // Helper functions
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject('Erro ao ler o arquivo');
            reader.readAsDataURL(file);
        });
    }
    
    // Connect to WebSocket server
    function connectToServer() {
        // For local development, we'll use a mock socket implementation
        // In a real implementation, you would connect to a real WebSocket server
        mockSocketImplementation();
        
        // Join the default channel
        joinChannel(currentChannel);
        
        // Load and display all users
        loadUsersList();
    }
    
    // Load and display all users in the users panel
    async function loadUsersList() {
        try {
            const users = await getAllUsers();
            const usersList = document.getElementById('users-list');
            
            // Clear the users list
            usersList.innerHTML = '';
            
            // Add online category
            const onlineCategory = document.createElement('div');
            onlineCategory.classList.add('users-category');
            onlineCategory.textContent = 'ONLINE';
            usersList.appendChild(onlineCategory);
            
            // Add users to the list
            users.forEach(user => {
                const userItem = document.createElement('div');
                userItem.classList.add('users-list-item');
                
                // Create user avatar
                const userAvatar = document.createElement('div');
                userAvatar.classList.add('user-avatar');
                
                // Add status class based on user's actual status
                const status = user.status || 'online';
                userAvatar.classList.add(status);
                
                if (user.profilePicture) {
                    const img = document.createElement('img');
                    img.src = user.profilePicture;
                    userAvatar.appendChild(img);
                } else {
                    // Use first letter of username as avatar text
                    userAvatar.textContent = user.username.charAt(0).toUpperCase();
                }
                
                // Create user info container
                const userInfo = document.createElement('div');
                userInfo.classList.add('user-info');
                
                // Add username
                const username = document.createElement('div');
                username.classList.add('username');
                username.textContent = user.username;
                
                // Add user status text
                const userStatus = document.createElement('div');
                userStatus.classList.add('user-status');
                
                // Set status text based on status
                switch(status) {
                    case 'online':
                        userStatus.textContent = 'Online';
                        break;
                    case 'busy':
                        userStatus.textContent = 'Ocupado';
                        break;
                    case 'away':
                        userStatus.textContent = 'Ausente';
                        break;
                    case 'offline':
                        userStatus.textContent = 'Offline';
                        break;
                    default:
                        userStatus.textContent = 'Online';
                }
                
                // Assemble the user item
                userInfo.appendChild(username);
                userInfo.appendChild(userStatus);
                
                userItem.appendChild(userAvatar);
                userItem.appendChild(userInfo);
                
                usersList.appendChild(userItem);
            });
        } catch (error) {
            console.error('Error loading users list:', error);
        }
    }
    
    // Mock WebSocket implementation for demonstration
    function mockSocketImplementation() {
        // Create a mock socket object
        socket = {
            emit: (event, data) => {
                console.log(`Emitting ${event}:`, data);
                
                // Simulate receiving the message back from the server
                if (event === 'send_message') {
                    setTimeout(() => {
                        receiveMessage({
                            username: data.username,
                            message: data.message,
                            channel: data.channel,
                            timestamp: new Date().toISOString(),
                            profilePicture: currentUser.profilePicture
                        });
                    }, 100);
                }
            },
            on: (event, callback) => {
                console.log(`Registered handler for ${event}`);
            }
        };
        
        // Add some welcome messages to each channel
        const welcomeMessages = [
            { channel: 'geral', message: 'Bem-vindo ao canal #geral! Este é o canal principal para discussões gerais.' },
            { channel: 'tecnico', message: 'Bem-vindo ao canal #tecnico! Aqui você pode discutir assuntos técnicos.' },
            { channel: 'comercial', message: 'Bem-vindo ao canal #comercial! Este canal é dedicado a assuntos comerciais.' },
            { channel: 'interno', message: 'Bem-vindo ao canal #interno! Este canal é para comunicações internas da equipe.' }
        ];
        
        welcomeMessages.forEach(msg => {
            messageHistory[msg.channel].push({
                username: 'Sistema',
                message: msg.message,
                channel: msg.channel,
                timestamp: new Date().toISOString(),
                profilePicture: null
            });
        });
    }
    
    // Join a channel
    function joinChannel(channel) {
        currentChannel = channel;
        currentChannelDisplay.textContent = `# ${channel}`;
        
        // Update active channel in UI
        channelElements.forEach(el => {
            if (el.dataset.channel === channel) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
        
        // Clear messages container
        messagesContainer.innerHTML = '';
        
        // Load message history for this channel
        messageHistory[channel].forEach(msg => {
            displayMessage(msg);
        });
        
        // Restore subchat containers for this channel
        restoreSubchats();
        
        // Scroll to bottom
        scrollToBottom();
        
        // In a real implementation, you would emit a 'join_channel' event to the server
        console.log(`Joined channel: ${channel}`);
    }
    
    // Restore subchat containers after channel switch
    function restoreSubchats() {
        // For each message in the current channel
        const messageElements = document.querySelectorAll('.message');
        
        // First, check all message IDs in the current view
        const visibleMessageIds = Array.from(messageElements).map(el => el.dataset.messageId);
        
        // For each message ID that has subchat history
        Object.keys(subchatHistory).forEach(messageId => {
            // Only process if this message has subchat history and is visible in the current channel
            if (subchatHistory[messageId].length > 0 && visibleMessageIds.includes(messageId)) {
                const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
                if (!messageElement) return; // Skip if message element not found
                
                // Create subchat container if it doesn't exist
                let subchatContainer = document.querySelector(`.subchat-container[data-parent-id="${messageId}"]`);
                
                if (!subchatContainer) {
                    // Get the original message data
                    const senderElement = messageElement.querySelector('.message-sender');
                    const senderName = senderElement ? senderElement.textContent : 'Unknown';
                    
                    // Create new subchat container
                    subchatContainer = document.createElement('div');
                    subchatContainer.classList.add('subchat-container');
                    subchatContainer.dataset.parentId = messageId;
                    
                    // Create subchat header
                    const subchatHeader = document.createElement('div');
                    subchatHeader.classList.add('subchat-header');
                    subchatHeader.innerHTML = `<i class="fas fa-reply"></i> Respondendo a ${senderName}`;
                    subchatContainer.appendChild(subchatHeader);
                    
                    // Create subchat messages container
                    const subchatMessages = document.createElement('div');
                    subchatMessages.classList.add('subchat-messages');
                    subchatContainer.appendChild(subchatMessages);
                    
                    // Create subchat input
                    const subchatInputContainer = document.createElement('div');
                    subchatInputContainer.classList.add('subchat-input');
                    
                    const subchatInput = document.createElement('input');
                    subchatInput.type = 'text';
                    subchatInput.placeholder = 'Digite sua resposta...';
                    subchatInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter' && subchatInput.value.trim()) {
                            sendSubchatMessage(messageId, subchatInput.value.trim());
                            subchatInput.value = '';
                        }
                    });
                    
                    const subchatSendButton = document.createElement('button');
                    subchatSendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
                    subchatSendButton.addEventListener('click', () => {
                        if (subchatInput.value.trim()) {
                            sendSubchatMessage(messageId, subchatInput.value.trim());
                            subchatInput.value = '';
                        }
                    });
                    
                    subchatInputContainer.appendChild(subchatInput);
                    subchatInputContainer.appendChild(subchatSendButton);
                    subchatContainer.appendChild(subchatInputContainer);
                    
                    // Insert subchat after the message
                    messageElement.after(subchatContainer);
                    
                    // Display all subchat messages
                    subchatHistory[messageId].forEach(msg => {
                        displaySubchatMessage(messageId, msg);
                    });
                    
                    // Don't automatically make the subchat container active
                    // subchatContainer.classList.add('active');
                    
                    // Update the message count in the UI
                    updateSubchatCount(messageId);
                }
            }
        });
    }
    
    // Send message
    function sendMessage() {
        const message = messageInput.value.trim();
        if (message && currentUser) {
            // Emit message to server
            socket.emit('send_message', {
                username: currentUser.username,
                message,
                channel: currentChannel
            });
            
            // Clear input
            messageInput.value = '';
        }
    }
    
    // Receive message
    function receiveMessage(data) {
        // Add to message history
        messageHistory[data.channel].push(data);
        
        // If message is for current channel, display it
        if (data.channel === currentChannel) {
            displayMessage(data);
            scrollToBottom();
        }
    }
    
    // Display message in UI
    function displayMessage(data) {
        // Check if it's a system message
        if (data.username === 'Sistema') {
            const systemMessage = document.createElement('div');
            systemMessage.classList.add('system-message');
            systemMessage.innerHTML = `<i class="fas fa-check-circle checkmark"></i> ${data.message}`;
            messagesContainer.appendChild(systemMessage);
            return;
        }
        
        // Generate a consistent message ID based on channel, username, timestamp and message content
        // This ensures the same message gets the same ID when redisplayed after channel switching
        const messageIdBase = `${data.channel}-${data.username}-${data.timestamp}-${data.message.substring(0, 20)}`;
        const messageId = btoa(messageIdBase).replace(/[^a-zA-Z0-9]/g, '');
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.dataset.messageId = messageId; // Use consistent message ID
        
        // Create avatar
        const avatarElement = document.createElement('div');
        avatarElement.classList.add('message-avatar');
        avatarElement.classList.add(data.status || 'online');
        
        if (data.profilePicture) {
            const img = document.createElement('img');
            img.src = data.profilePicture;
            avatarElement.appendChild(img);
        } else {
            // Use first letter of username as avatar text
            avatarElement.textContent = data.username.charAt(0).toUpperCase();
        }
        
        // Create message content container
        const contentContainer = document.createElement('div');
        contentContainer.classList.add('message-content');
        
        // Create message header
        const messageHeader = document.createElement('div');
        messageHeader.classList.add('message-header');
        
        // Add sender name
        const senderElement = document.createElement('div');
        senderElement.classList.add('message-sender');
        senderElement.textContent = data.username;
        messageHeader.appendChild(senderElement);
        
        // Add roles if needed (for demonstration)
        if (data.username === 'Atendente Virtual') {
            const roleAdmin = document.createElement('span');
            roleAdmin.classList.add('message-role', 'role-admin');
            roleAdmin.textContent = 'Admin';
            messageHeader.appendChild(roleAdmin);
            
            const roleAgent = document.createElement('span');
            roleAgent.classList.add('message-role', 'role-agent');
            roleAgent.textContent = 'Livechat Agent';
            messageHeader.appendChild(roleAgent);
            
            const roleManager = document.createElement('span');
            roleManager.classList.add('message-role', 'role-manager');
            roleManager.textContent = 'Livechat Manager';
            messageHeader.appendChild(roleManager);
            
            const roleBot = document.createElement('span');
            roleBot.classList.add('message-role', 'role-bot');
            roleBot.textContent = 'Bot';
            messageHeader.appendChild(roleBot);
        }
        
        // Add timestamp
        const timeElement = document.createElement('div');
        timeElement.classList.add('message-time');
        const date = new Date(data.timestamp);
        timeElement.textContent = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        messageHeader.appendChild(timeElement);
        
        // Add message text
        const messageText = document.createElement('div');
        messageText.classList.add('message-text');
        messageText.textContent = data.message;
        
        // Create message actions container (for reply button and stats)
        const messageActions = document.createElement('div');
        messageActions.classList.add('message-actions');
        
        // Add reply button
        const replyButton = document.createElement('button');
        replyButton.classList.add('reply-button');
        replyButton.textContent = 'Responder';
        replyButton.addEventListener('click', () => {
            // Get the message ID
            const messageId = messageElement.dataset.messageId;
            
            // Create subchat if it doesn't exist
            if (!subchatHistory[messageId]) {
                subchatHistory[messageId] = [];
            }
            
            // Set this message as the active subchat
            activeSubchat = messageId;
            
            // Create or show subchat container
            let subchatContainer = document.querySelector(`.subchat-container[data-parent-id="${messageId}"]`);
            
            if (!subchatContainer) {
                // Create new subchat container
                subchatContainer = document.createElement('div');
                subchatContainer.classList.add('subchat-container');
                subchatContainer.dataset.parentId = messageId;
                
                // Create subchat header
                const subchatHeader = document.createElement('div');
                subchatHeader.classList.add('subchat-header');
                subchatHeader.innerHTML = `<i class="fas fa-reply"></i> Respondendo a ${data.username}`;
                subchatContainer.appendChild(subchatHeader);
                
                // Create subchat messages container
                const subchatMessages = document.createElement('div');
                subchatMessages.classList.add('subchat-messages');
                subchatContainer.appendChild(subchatMessages);
                
                // Create subchat input
                const subchatInputContainer = document.createElement('div');
                subchatInputContainer.classList.add('subchat-input');
                
                const subchatInput = document.createElement('input');
                subchatInput.type = 'text';
                subchatInput.placeholder = 'Digite sua resposta...';
                subchatInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && subchatInput.value.trim()) {
                        sendSubchatMessage(messageId, subchatInput.value.trim());
                        subchatInput.value = '';
                    }
                });
                
                const subchatSendButton = document.createElement('button');
                subchatSendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
                subchatSendButton.addEventListener('click', () => {
                    if (subchatInput.value.trim()) {
                        sendSubchatMessage(messageId, subchatInput.value.trim());
                        subchatInput.value = '';
                    }
                });
                
                subchatInputContainer.appendChild(subchatInput);
                subchatInputContainer.appendChild(subchatSendButton);
                subchatContainer.appendChild(subchatInputContainer);
                
                // Insert subchat after the message
                messageElement.after(subchatContainer);
            } else {
                // Toggle visibility if already exists
                subchatContainer.classList.toggle('active');
            }
            
            // Update the message count in the UI
            updateSubchatCount(messageId);
        });
        messageActions.appendChild(replyButton);
        
        // Add message stats
        const messageStats = document.createElement('div');
        messageStats.classList.add('message-stats');
        
        // Add comment count
        const commentCount = document.createElement('div');
        commentCount.classList.add('message-stat');
        commentCount.innerHTML = `<i class="fas fa-comment"></i> 0`; // Start with zero comments
        messageStats.appendChild(commentCount);
        
        // Make comment count clickable to show/hide subchat
        commentCount.style.cursor = 'pointer';
        commentCount.addEventListener('click', () => {
            const messageId = messageElement.dataset.messageId;
            const subchatContainer = document.querySelector(`.subchat-container[data-parent-id="${messageId}"]`);
            
            if (subchatContainer) {
                subchatContainer.classList.toggle('active');
            }
        });
        
        // View count removed as requested
        
        messageActions.appendChild(messageStats);
        
        // Assemble the message
        contentContainer.appendChild(messageHeader);
        contentContainer.appendChild(messageText);
        contentContainer.appendChild(messageActions);
        
        messageElement.appendChild(avatarElement);
        messageElement.appendChild(contentContainer);
        
        messagesContainer.appendChild(messageElement);
    }
    
    // Send a message in a subchat
    function sendSubchatMessage(parentId, message) {
        if (!currentUser || !message) return;
        
        // Create message data
        const messageData = {
            username: currentUser.username,
            message: message,
            timestamp: new Date().toISOString(),
            profilePicture: currentUser.profilePicture,
            parentId: parentId
        };
        
        // Add to subchat history
        if (!subchatHistory[parentId]) {
            subchatHistory[parentId] = [];
        }
        subchatHistory[parentId].push(messageData);
        
        // Display the subchat message
        displaySubchatMessage(parentId, messageData);
        
        // Update the message count in the UI
        updateSubchatCount(parentId);
    }
    
    // Display a message in a subchat
    function displaySubchatMessage(parentId, data) {
        const subchatContainer = document.querySelector(`.subchat-container[data-parent-id="${parentId}"]`);
        if (!subchatContainer) return;
        
        const subchatMessages = subchatContainer.querySelector('.subchat-messages');
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.classList.add('subchat-message');
        
        // Create avatar
        const avatarElement = document.createElement('div');
        avatarElement.classList.add('subchat-avatar');
        avatarElement.classList.add(data.status || 'online');
        
        if (data.profilePicture) {
            const img = document.createElement('img');
            img.src = data.profilePicture;
            avatarElement.appendChild(img);
        } else {
            // Use first letter of username as avatar text
            avatarElement.textContent = data.username.charAt(0).toUpperCase();
        }
        
        // Create message content
        const contentElement = document.createElement('div');
        contentElement.classList.add('subchat-content');
        
        // Create message header
        const headerElement = document.createElement('div');
        headerElement.classList.add('subchat-header-info');
        
        // Add sender name
        const senderElement = document.createElement('div');
        senderElement.classList.add('subchat-sender');
        senderElement.textContent = data.username;
        headerElement.appendChild(senderElement);
        
        // Add timestamp
        const timeElement = document.createElement('div');
        timeElement.classList.add('subchat-time');
        const date = new Date(data.timestamp);
        timeElement.textContent = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        headerElement.appendChild(timeElement);
        
        // Add message text
        const textElement = document.createElement('div');
        textElement.classList.add('subchat-text');
        textElement.textContent = data.message;
        
        // Assemble the message
        contentElement.appendChild(headerElement);
        contentElement.appendChild(textElement);
        
        messageElement.appendChild(avatarElement);
        messageElement.appendChild(contentElement);
        
        subchatMessages.appendChild(messageElement);
        
        // Scroll to bottom of subchat
        subchatMessages.scrollTop = subchatMessages.scrollHeight;
    }
    
    // Update the subchat count for a message
    function updateSubchatCount(messageId) {
        const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!messageElement) return;
        
        const commentCount = messageElement.querySelector('.message-stat i.fa-comment').parentNode;
        const count = subchatHistory[messageId] ? subchatHistory[messageId].length : 0;
        
        commentCount.innerHTML = `<i class="fas fa-comment"></i> ${count}`;
    }
    
    // Scroll messages container to bottom
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Event listeners
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    } else {
        console.error('Send button not found');
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    } else {
        console.error('Message input not found');
    }
    
    // Channel switching
    if (channelElements && channelElements.length > 0) {
        channelElements.forEach(el => {
            el.addEventListener('click', () => {
                const channel = el.dataset.channel;
                joinChannel(channel);
            });
        });
    } else {
        console.error('Channel elements not found');
    }
    
    // Initialize user settings functionality
    function initUserSettings(user) {
        // Set initial values
        if (settingsUsername) {
            settingsUsername.value = user.username;
        }
        
        // Set initial status
        setUserStatus(currentUserStatus);
        
        // Set initial profile picture
        if (userAvatarSmall) {
            if (user.profilePicture) {
                userAvatarSmall.innerHTML = '';
                const img = document.createElement('img');
                img.src = user.profilePicture;
                userAvatarSmall.appendChild(img);
            } else {
                userAvatarSmall.textContent = user.username.charAt(0).toUpperCase();
            }
            userAvatarSmall.classList.add(currentUserStatus);
        }
        
        // Set settings profile picture preview
        if (settingsProfilePreview && user.profilePicture) {
            settingsProfilePreview.innerHTML = '';
            const img = document.createElement('img');
            img.src = user.profilePicture;
            settingsProfilePreview.appendChild(img);
        }
        
        // Toggle settings dropdown
        if (userProfileHeader && userSettingsDropdown) {
            userProfileHeader.addEventListener('click', () => {
                userSettingsDropdown.classList.toggle('active');
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!userProfileHeader.contains(e.target) && !userSettingsDropdown.contains(e.target)) {
                    userSettingsDropdown.classList.remove('active');
                }
            });
        }
        
        // Status options click handler
        if (statusOptions && statusOptions.length > 0) {
            statusOptions.forEach(option => {
                // Set initial active status
                if (option.dataset.status === currentUserStatus) {
                    option.classList.add('active');
                }
                
                option.addEventListener('click', () => {
                    const status = option.dataset.status;
                    setUserStatus(status);
                    
                    // Update active class
                    statusOptions.forEach(opt => opt.classList.remove('active'));
                    option.classList.add('active');
                });
            });
        }
        
        // Profile picture preview in settings
        if (settingsProfilePicture && settingsProfilePreview) {
            settingsProfilePicture.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        // Clear the preview and add the image
                        settingsProfilePreview.innerHTML = '';
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        settingsProfilePreview.appendChild(img);
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
        
        // Save settings button
        if (saveSettingsButton) {
            saveSettingsButton.addEventListener('click', saveUserSettings);
        }
    }
    
    // Set user status
    function setUserStatus(status) {
        currentUserStatus = status;
        
        // Update user avatar status indicator
        if (userAvatarSmall) {
            userAvatarSmall.classList.remove('online', 'busy', 'away', 'offline');
            userAvatarSmall.classList.add(status);
        }
        
        console.log(`User status changed to: ${status}`);
    }
    
    // Save user settings
    async function saveUserSettings() {
        if (!currentUser) return;
        
        // Get new values
        const newUsername = settingsUsername.value.trim();
        
        // Validate username
        if (!newUsername) {
            alert('Por favor, insira um nome de usuário válido');
            return;
        }
        
        // Get profile picture if changed
        let newProfilePicture = currentUser.profilePicture;
        if (settingsProfilePicture.files.length > 0) {
            const file = settingsProfilePicture.files[0];
            newProfilePicture = await readFileAsDataURL(file);
        }
        
        // Update user object
        const updatedUser = {
            ...currentUser,
            username: newUsername,
            profilePicture: newProfilePicture,
            status: currentUserStatus
        };
        
        try {
            // Update user in database
            const transaction = db.transaction([USERS_STORE], 'readwrite');
            const usersStore = transaction.objectStore(USERS_STORE);
            const updateRequest = usersStore.put(updatedUser);
            
            updateRequest.onsuccess = () => {
                // Update current user
                currentUser = updatedUser;
                
                // Update UI
                currentUserDisplay.textContent = newUsername;
                
                // Update avatar in sidebar
                if (userAvatarSmall) {
                    if (newProfilePicture) {
                        userAvatarSmall.innerHTML = '';
                        const img = document.createElement('img');
                        img.src = newProfilePicture;
                        userAvatarSmall.appendChild(img);
                    } else {
                        userAvatarSmall.textContent = newUsername.charAt(0).toUpperCase();
                    }
                }
                
                // Close settings dropdown
                userSettingsDropdown.classList.remove('active');
                
                // Refresh the users list
                loadUsersList();
                
                alert('Configurações salvas com sucesso!');
            };
            
            updateRequest.onerror = (event) => {
                console.error('Error updating user:', event.target.error);
                alert('Erro ao salvar configurações');
            };
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Erro ao salvar configurações');
        }
    }
});
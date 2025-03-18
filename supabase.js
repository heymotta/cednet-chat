import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function initializeSupabase() {
    // Create messages table
    const { error: messagesError } = await supabase
        .from('messages')
        .select()
        .limit(1)
        .catch(async () => {
            return await supabase.rpc('create_messages_table', {
                sql: `
                    CREATE TABLE IF NOT EXISTS messages (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        "user" TEXT,
                        message TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
                        channel TEXT
                    );
                `
            });
        });

    if (messagesError) {
        console.error('Error creating messages table:', messagesError);
        return false;
    }

    // Create users table
    const { error: usersError } = await supabase
        .from('users')
        .select()
        .limit(1)
        .catch(async () => {
            return await supabase.rpc('create_users_table', {
                sql: `
                    CREATE TABLE IF NOT EXISTS users (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        username TEXT UNIQUE,
                        email TEXT UNIQUE,
                        password TEXT,
                        avatar_url TEXT,
                        status TEXT DEFAULT 'offline',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
                    );
                `
            });
        });

    if (usersError) {
        console.error('Error creating users table:', usersError);
        return false;
    }

    return true;
}

// Enable realtime subscriptions
export function subscribeToMessages(callback) {
    return supabase
        .channel('messages')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'messages' },
            (payload) => callback(payload)
        )
        .subscribe();
}

// Send a message
export async function sendMessage(message) {
    const { data, error } = await supabase
        .from('messages')
        .insert([message]);

    if (error) {
        console.error('Error sending message:', error);
        return false;
    }
    return true;
}

// Get messages for a channel
export async function getMessages(channel) {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel', channel)
        .order('created_at', { ascending: true });


    if (error) {
        console.error('Error fetching messages:', error);
        return [];
    }
    return data;
}
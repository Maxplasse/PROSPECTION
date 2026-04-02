import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!SLACK_BOT_TOKEN) {
      throw new Error('SLACK_BOT_TOKEN not configured')
    }

    const { slack_user_id, message } = await req.json()

    if (!slack_user_id || !message) {
      return new Response(
        JSON.stringify({ error: 'slack_user_id and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Open a DM channel with the user
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slack_user_id }),
    })
    const openData = await openRes.json()

    if (!openData.ok) {
      throw new Error(`Failed to open DM: ${openData.error}`)
    }

    const channelId = openData.channel.id

    // Send the message
    const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: message,
      }),
    })
    const msgData = await msgRes.json()

    if (!msgData.ok) {
      throw new Error(`Failed to send message: ${msgData.error}`)
    }

    return new Response(
      JSON.stringify({ success: true, ts: msgData.ts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

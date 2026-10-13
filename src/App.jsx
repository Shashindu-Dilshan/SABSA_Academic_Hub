import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase.js'

const BUCKET = 'wall-uploads'
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function Icon({ name, size = 20, fill = 'none' }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill, stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>
  if (name === 'heart') return <svg {...common}><path d="M20.8 8.6c0 4.2-8.8 10-8.8 10s-8.8-5.8-8.8-10A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.8 2.2Z"/></svg>
  if (name === 'paperclip') return <svg {...common}><path d="m8.5 12.5 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-9.2 9.2a5 5 0 0 1-7.1-7.1l9-9"/></svg>
  if (name === 'close') return <svg {...common}><path d="m18 6-12 12M6 6l12 12"/></svg>
  if (name === 'shield') return <svg {...common}><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg>
  if (name === 'logout') return <svg {...common}><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>
  return null
}

function relativeDate(value) {
  const date = new Date(value)
  const elapsed = Math.max(0, Date.now() - date.getTime())
  const hours = Math.floor(elapsed / 3_600_000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S'
}

function Attachment({ path, signedUrl }) {
  if (!path) return null
  if (!signedUrl) return <div className="attachment-pending"><Icon name="paperclip" size={17}/> Attachment is private</div>
  const isImage = /\.(jpe?g|png|webp)$/i.test(path)
  return isImage
    ? <a className="attachment-image" href={signedUrl} target="_blank" rel="noreferrer"><img src={signedUrl} alt="Post attachment" loading="lazy"/></a>
    : <a className="attachment-file" href={signedUrl} target="_blank" rel="noreferrer"><Icon name="paperclip" size={18}/><span>{path.split('/').at(-1)}</span><span className="file-open">Open ↗</span></a>
}

export default function App() {
  const [posts, setPosts] = useState([])
  const [likes, setLikes] = useState([])
  const [visitorId, setVisitorId] = useState('')
  const [query, setQuery] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [form, setForm] = useState({ name: '', batch: '', content: '' })
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [adminOpen, setAdminOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [isCommittee, setIsCommittee] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)
  const [signedFiles, setSignedFiles] = useState({})
  const [decisionFeedback, setDecisionFeedback] = useState({})

  const loadFeed = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase.from('wall_posts')
      .select('id,name,batch,content,attachment_path,created_at,published_at,status')
      .eq('status', 'approved')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(100)
    if (fetchError) setError(fetchError.message)
    else {
      setPosts(data ?? [])
      if (data?.length) {
        const { data: likeRows, error: likeError } = await supabase.from('wall_likes').select('post_id,visitor_id').in('post_id', data.map((post) => post.id))
        if (likeError) setError(likeError.message)
        else setLikes(likeRows ?? [])
        const paths = data.map((post) => post.attachment_path).filter(Boolean)
        const entries = await Promise.all(paths.map(async (path) => {
          const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
          return [path, signed?.signedUrl || '']
        }))
        setSignedFiles((current) => ({ ...current, ...Object.fromEntries(entries) }))
      } else setLikes([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadFeed()
    if (!supabase) return undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setVisitorId(nextSession?.user?.id || '')
      setIsCommittee(false)
    })
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (currentSession) {
        setSession(currentSession)
        setVisitorId(currentSession.user.id)
      } else {
        const { error: anonymousError } = await supabase.auth.signInAnonymously()
        if (anonymousError) setError(`Enable anonymous sign-ins in Supabase Auth to use likes: ${anonymousError.message}`)
      }
    })
    return () => subscription.unsubscribe()
  }, [loadFeed])

  useEffect(() => {
    if (!supabase || !session?.user) return
    let active = true
    supabase.rpc('is_committee_member').then(({ data, error: rpcError }) => {
      if (!active) return
      if (rpcError) setError(rpcError.message)
      setIsCommittee(Boolean(data))
      if (data) loadPending()
    })
    return () => { active = false }
  }, [session, loadFeed])

  async function loadPending() {
    const { data, error: pendingError } = await supabase.from('wall_posts')
      .select('id,name,batch,content,attachment_path,created_at,status')
      .in('status', ['pending', 'revision_requested'])
      .order('created_at', { ascending: true })
    if (pendingError) {
      setError(pendingError.message)
      return
    }
    const privatePosts = data ?? []
    setPendingPosts(privatePosts)
    const paths = privatePosts.filter((post) => post.attachment_path).map((post) => post.attachment_path)
    if (paths.length) {
      const entries = await Promise.all(paths.map(async (path) => {
        const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
        if (signError) return [path, '']
        return [path, signed.signedUrl]
      }))
      setSignedFiles(Object.fromEntries(entries))
    }
  }

  const [pendingPosts, setPendingPosts] = useState([])

  const visiblePosts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return posts
    return posts.filter((post) => `${post.name} ${post.batch} ${post.content}`.toLocaleLowerCase().includes(term))
  }, [posts, query])

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submitPost(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!supabase) return setError('Add your Supabase URL and publishable key to .env to enable submissions.')
    if (form.name.trim().length < 2 || form.name.trim().length > 100) return setError('Please enter a name between 2 and 100 characters.')
    if (!form.batch.trim() || form.batch.trim().length > 50) return setError('Please enter your batch (up to 50 characters).')
    if (!form.content.trim() || form.content.trim().length > 10000) return setError('Your post must be between 1 and 10,000 characters.')
    if (file && (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_ATTACHMENT_BYTES)) return setError('Choose a JPG, PNG, WEBP or PDF file up to 5 MB.')
    setSubmitting(true)
    let attachmentPath = null
    const postId = crypto.randomUUID()
    if (file) {
      const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
      attachmentPath = `${postId}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(attachmentPath, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        setSubmitting(false)
        return setError(`Attachment upload failed: ${uploadError.message}`)
      }
    }
    const { error: insertError } = await supabase.from('wall_posts').insert({
      id: postId,
      name: form.name.trim(),
      batch: form.batch.trim(),
      content: form.content.trim(),
      attachment_path: attachmentPath,
      status: 'pending',
    })
    if (insertError) {
      if (attachmentPath) await supabase.storage.from(BUCKET).remove([attachmentPath])
      setError(insertError.message)
    } else {
      setNotice('Your post is with the Education Committee for review. Thanks for sharing!')
      setForm({ name: '', batch: '', content: '' })
      setFile(null)
      setComposerOpen(false)
    }
    setSubmitting(false)
  }

  async function toggleLike(postId) {
    if (!supabase || !visitorId) return
    setError('')
    const existing = likes.find((like) => like.post_id === postId && like.visitor_id === visitorId)
    if (existing) {
      const { error: deleteError } = await supabase.from('wall_likes').delete().eq('post_id', postId).eq('visitor_id', visitorId)
      if (deleteError) setError(deleteError.message)
      else setLikes((current) => current.filter((like) => !(like.post_id === postId && like.visitor_id === visitorId)))
    } else {
      const { data, error: insertError } = await supabase.from('wall_likes').insert({ post_id: postId, visitor_id: visitorId }).select('post_id,visitor_id').single()
      if (insertError) setError(insertError.message)
      else setLikes((current) => [...current, data])
    }
  }

  async function signInCommittee(event) {
    event.preventDefault()
    setAdminBusy(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
    setAdminBusy(false)
    if (authError) setError(authError.message)
  }

  async function reviewPost(postId, decision) {
    const feedback = decisionFeedback[postId] || null
    setAdminBusy(true)
    setError('')
    const { error: reviewError } = await supabase.rpc('review_wall_post', { p_post_id: postId, p_decision: decision, p_feedback: feedback })
    if (reviewError) setError(reviewError.message)
    else {
      setPendingPosts((current) => current.filter((post) => post.id !== postId))
      if (decision === 'approved') await loadFeed()
      setNotice(`Post ${decision === 'revision_requested' ? 'sent back for revision' : `${decision} successfully`}.`)
    }
    setAdminBusy(false)
  }

  async function signOutCommittee() {
    await supabase.auth.signOut()
    const { error: anonymousError } = await supabase.auth.signInAnonymously()
    if (anonymousError) setError(`Enable anonymous sign-ins in Supabase Auth to continue using reactions: ${anonymousError.message}`)
    setAdminOpen(false)
    setPendingPosts([])
    setIsCommittee(false)
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="SABSA Academic Hub home">
          <span className="brand-mark">S</span>
          <span className="brand-copy"><strong>SABSA</strong><span>ACADEMIC HUB</span></span>
        </a>
        <button className="committee-link" onClick={() => { setAdminOpen(true); setError('') }}><Icon name="shield" size={16}/><span>Committee</span></button>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><span className="live-dot"/> THE STUDENTS’ WALL</span>
            <h1>One community.<br/><span>Many stories.</span></h1>
            <p>A little corner of SAB where every batch, every idea and every voice belongs.</p>
            <div className="hero-proof"><span className="proof-avatars"><i>✦</i><i>✺</i><i>✿</i></span><span>Made by students, for students</span></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun-shape"/><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
            <div className="art-note note-one"><span>✦</span><b>Learn</b><small>grow together</small></div>
            <div className="art-note note-two"><span>✿</span><b>Share</b><small>your story</small></div>
            <div className="art-note note-three"><span>↗</span><b>Connect</b><small>across batches</small></div>
            <div className="art-center"><span>SAB</span><small>STUDENTS’ ASSOCIATION</small></div>
          </div>
          <div className="hero-stamp">A space<br/>to belong <span>↘</span></div>
        </section>

        <section className="wall-section" id="wall">
          <div className="section-heading"><div><span className="eyebrow muted">THE COMMUNITY BOARD</span><h2>From our wall</h2></div><p>Good things happen when we<br className="desktop-break"/> put our thoughts out there.</p></div>
          <div className="feed-tools">
            <label className="search-box"><Icon name="search" size={19}/><input aria-label="Search posts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stories, names, batches..."/><kbd>⌕</kbd></label>
            <button className="create-button" onClick={() => { setComposerOpen(true); setNotice(''); setError('') }}><Icon name="plus" size={18}/>Create post</button>
          </div>

          {notice && <div className="notice success-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
          {error && !adminOpen && <div className="notice error-notice" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
          {!isSupabaseConfigured && <div className="config-notice"><strong>Connect the wall</strong><span>Add the Supabase URL and publishable key in <code>.env</code> to load posts and enable submissions.</span></div>}
          {loading ? <div className="empty-state"><span className="loader"/><p>Gathering stories...</p></div> : visiblePosts.length ? <div className="post-list">
            {visiblePosts.map((post, index) => {
              const postLikes = likes.filter((like) => like.post_id === post.id)
              const liked = postLikes.some((like) => like.visitor_id === visitorId)
              return <article className="post-card" key={post.id} style={{ '--card-index': index }}>
                <div className="post-top"><div className={`avatar avatar-${index % 5}`}>{initials(post.name)}</div><div className="post-author"><strong>{post.name}</strong><span>Batch {post.batch}</span></div><span className="post-time">{relativeDate(post.published_at || post.created_at)}</span></div>
                <p className="post-content">{post.content}</p>
                <Attachment path={post.attachment_path} signedUrl={signedFiles[post.attachment_path]}/>
                <div className="post-bottom"><button className={`like-button${liked ? ' is-liked' : ''}`} onClick={() => toggleLike(post.id)} aria-pressed={liked} aria-label={`${liked ? 'Unlike' : 'Like'} post by ${post.name}`}><Icon name="heart" size={19} fill={liked ? 'currentColor' : 'none'}/><span>{postLikes.length}</span><span className="like-label">{postLikes.length === 1 ? 'like' : 'likes'}</span></button><span className="published-label"><span/> On the wall</span></div>
              </article>
            })}
          </div> : <div className="empty-state"><span className="empty-spark">✳</span><h3>{query ? 'Nothing found just yet.' : 'A fresh wall, full of possibility.'}</h3><p>{query ? 'Try another name, batch or phrase.' : 'Be the first to share a thought with the SAB community.'}</p>{!query && <button className="text-button" onClick={() => setComposerOpen(true)}>Write the first post <span>↗</span></button>}</div>}
        </section>

        <section className="bottom-callout"><div className="callout-star">✳</div><div><span className="eyebrow">YOUR WORDS MAKE THE WALL</span><h2>Have something to share?</h2><p>Drop a thought, celebrate a win or leave a little note for your batchmates.</p></div><button className="create-button light-button" onClick={() => setComposerOpen(true)}><Icon name="plus" size={18}/>Create a post</button></section>
      </main>
      <footer><a className="brand footer-brand" href="#top"><span className="brand-mark">S</span><span className="brand-copy"><strong>SABSA</strong><span>ACADEMIC HUB</span></span></a><span>A shared space for the SAB community.</span><span>© SABSA Students’ Association</span></footer>

      {composerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false) }}><section className="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title"><div className="modal-heading"><div><span className="eyebrow muted">ADD TO THE WALL</span><h2 id="composer-title">Share a thought</h2></div><button className="icon-button" onClick={() => setComposerOpen(false)} aria-label="Close"><Icon name="close"/></button></div><p className="modal-intro">Your post will appear after the Education Committee reviews it.</p><form onSubmit={submitPost} className="composer-form"><label>Your name<input name="name" value={form.name} onChange={updateForm} maxLength={100} placeholder="How should we know you?" required/></label><label>Your batch<input name="batch" value={form.batch} onChange={updateForm} maxLength={50} placeholder="e.g. 2023 / Batch 18" required/></label><label>Your message<textarea name="content" value={form.content} onChange={updateForm} maxLength={10000} rows={5} placeholder="Write something worth sharing..." required/><span className="char-count">{form.content.length}/10,000</span></label><label className="upload-field"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)}/><span className="upload-icon"><Icon name="paperclip" size={19}/></span><span><strong>{file ? file.name : 'Add an attachment'}</strong><small>JPG, PNG, WEBP or PDF · max 5 MB · optional</small></span>{file && <button type="button" className="remove-file" onClick={(event) => { event.preventDefault(); setFile(null) }}>Remove</button>}</label>{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-foot"><span><Icon name="shield" size={16}/> Reviewed before publishing</span><button className="create-button" type="submit" disabled={submitting}>{submitting ? 'Sending...' : 'Send for review'}<span>↗</span></button></div></form></section></div>}

      {adminOpen && <div className="modal-backdrop admin-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdminOpen(false) }}><section className="modal admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title"><div className="modal-heading"><div><span className="eyebrow muted">EDUCATION COMMITTEE</span><h2 id="admin-title">Review desk</h2></div><button className="icon-button" onClick={() => setAdminOpen(false)} aria-label="Close"><Icon name="close"/></button></div>{error && <div className="notice error-notice">{error}</div>}{!session ? <form className="admin-login" onSubmit={signInCommittee}><p>Sign in with your committee account to review pending posts.</p><label>Email<input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required autoComplete="username"/></label><label>Password<input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required autoComplete="current-password"/></label><button className="create-button" disabled={adminBusy}>{adminBusy ? 'Signing in...' : 'Sign in'}<span>↗</span></button></form> : !isCommittee ? <div className="admin-empty"><span className="admin-lock"><Icon name="shield" size={25}/></span><h3>Committee access required</h3><p>This account is signed in, but it is not listed as an Education Committee reviewer.</p><button className="text-button" onClick={signOutCommittee}>Sign out and try another account</button></div> : <><div className="admin-toolbar"><span>{pendingPosts.length} awaiting review</span><button className="text-button" onClick={loadPending}>Refresh ↻</button><button className="text-button" onClick={signOutCommittee}><Icon name="logout" size={15}/> Sign out</button></div><div className="pending-list">{pendingPosts.length ? pendingPosts.map((post) => <article className="pending-card" key={post.id}><div className="pending-meta"><div className="avatar avatar-4">{initials(post.name)}</div><div><strong>{post.name}</strong><span>Batch {post.batch} · {relativeDate(post.created_at)}</span></div><span className={`status-pill ${post.status}`}>{post.status === 'revision_requested' ? 'Revision' : 'Pending'}</span></div><p>{post.content}</p><Attachment path={post.attachment_path} signedUrl={signedFiles[post.attachment_path]}/><label className="feedback-label">Feedback (optional)<textarea rows={2} value={decisionFeedback[post.id] || ''} onChange={(event) => setDecisionFeedback((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Add a note for the student..."/></label><div className="review-actions"><button onClick={() => reviewPost(post.id, 'rejected')} disabled={adminBusy} className="reject-button">Reject</button><button onClick={() => reviewPost(post.id, 'revision_requested')} disabled={adminBusy} className="revision-button">Request revision</button><button onClick={() => reviewPost(post.id, 'approved')} disabled={adminBusy} className="approve-button">Approve</button></div></article>) : <div className="admin-empty"><span className="empty-spark">✳</span><h3>All caught up.</h3><p>New submissions will show up here.</p></div>}</div></>}</section></div>}
    </div>
  )
}

const STEPS = ['UNLOCK বাটনে ক্লিক করুন।', '৩টি অ্যাড আসবে, ওই অ্যাড গুলো সম্পূর্ণভাবে দেখুন।', 'শেষে ৫ সেকেন্ড অপেক্ষা করলে আনলক হবে।']
const NUMS = ['১', '২', '৩']

export default function TutorialSection({ tutorialId }) {
  return (
    <div className="fadeIn">
      <h3 style={{ color: '#a855f7', marginLeft: 5 }}>🎬 টিউটোরিয়াল</h3>
      <div className="info-box">
        <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 10, marginBottom: 20 }}>
          {tutorialId ? (
            <iframe src={tutorialId} style={{ width: '100%', height: '100%', border: 0 }} allowFullScreen title="tutorial" />
          ) : (
            <div style={{ color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              টিউটোরিয়াল লিংক সেট করা হয়নি
            </div>
          )}
        </div>
        {STEPS.map((s, i) => (
          <div className="step" key={i}>
            <div className="step-num">{NUMS[i]}</div>
            <div style={{ fontSize: 13, color: '#ddd' }}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

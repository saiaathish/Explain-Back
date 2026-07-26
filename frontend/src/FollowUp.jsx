export default function FollowUp({ question }) {
  return (
    <section className="follow-up" aria-labelledby="follow-up-title">
      <h2 id="follow-up-title">Follow-up question</h2>
      <p>{question}</p>
      <p className="follow-up-note">Answer in 2–3 sentences in your own words.</p>
    </section>
  );
}

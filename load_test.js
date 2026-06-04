import http from "k6/http";
import { sleep } from "k6";

export const options = {
  vus: 50,
  duration: "5s",
};

export default function () {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImYyY2EzMjg1LTA4OWQtNGM4MS1iZTU0LTM2ZjNlM2VlY2IxZSIsImVtYWlsIjoicmFodWxAdGVzdC5jb20iLCJpYXQiOjE3ODA0NjgyNjMsImV4cCI6MTc4MTA3MzA2M30.tDtiWzpiIP8laukHdANLP7HoQ74FESWD3v3Z3mq-RW4";

  const seat_id = "da19ada9-a3bb-440a-9d3e-92da235eb6ef"; // B1

  const res = http.post(
    "http://localhost:3000/api/v1/bookings/optimistic",
    JSON.stringify({ seat_id }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (res.status !== 409) {
    console.log(`Status: ${res.status} | Body: ${res.body}`);
  }

  sleep(0.1);
}